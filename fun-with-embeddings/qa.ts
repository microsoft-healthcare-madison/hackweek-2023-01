import * as util from "./util.ts";

interface QueryResult {
  filename: string;
  chunk: number;
  content: string;
  presented: boolean;
}

const RESULTS_PER_QUERY = 8;
async function query(q: string, o = 0): Promise<QueryResult[]> {
  const cmd = Deno.run({
    cmd: ["python", "search.py", q],
    stdout: "piped",
  });
  const output = await cmd.output();
  cmd.close();
  const outputText = new TextDecoder().decode(output);
  try {
    const outputJson = JSON.parse(outputText);
    return outputJson.slice(0, RESULTS_PER_QUERY).map((r: QueryResult) => ({...r, presented: false})) as QueryResult[];
  } catch(e) {
    console.log("Failed to query", q)
    return []
  }
}

interface PromptInput {
  draftAnswer: string,
  userQuestion: string,
  critique: string,
  history: string
}
const promptTemplate = ({draftAnswer, userQuestion, critique, history}: PromptInput) => `
You are a FHIR spec sherpa. Please answer user questions and provide helpful example instances.

---

At every step your output is a three-section markdown file containing:

# Draft Answer
(Synthesize a compelling answer to the user's question using the latest <RESULT> values. Please address the following: \n${critique})

# Critique Your Answer
(Look closely at the draft answer. Play the role of a picky reviewer to determine:
  * Break the user question into tiny pieces; output a bullet point for each piece and decide whether your draft answers the question to the user's delight
  * Break down your draft answer into sections; which sections can be deleted without upsetting the user?
  * Does the draft provide helpful JSON examples meeting all aspects of the user's request?
  * Does the draft include markdown https://hl7.org/fhir/* links to the FHIR spec?
  * Can you simplify the draft?
  * Which unnecessary details can you remove?
  * Which FHIR resources and elements do you mention? Does the "Current Session > Research Log" show queries to check the facts in your draft answer? Explain why or why not.
  * Consider new SEARCH_FHIR_SPEC(...) queries to explore areas of the specification based on the user's question, or to fact check your previous work.

Now output your critique with a "## Required Improvements" including bullets for what needs to be improved.

Now output your "## Required Additional Searches" including bullets for new search terms, if needed.)

# Immediate Action
(Select your next step as a single action based on the critique. 
* SEARCH_FHIR_SPEC(...) to gather data and continue improving your answer
* REFINE_ANSWER to address other critique items
* RETURN_FINAL_ANSWER to provide your final answer)

---
# Current Session

## Today's Date
${new Date().toISOString().slice(0, 10)}

## User Question
${userQuestion}

${draftAnswer ? `##  Answer
${draftAnswer}` : ""}

## Research Log
${history}

---OUTPUT BELOW---

# Draft Answer
`;

interface HistorySearch {
  type: "SEARCH";
  q: string;
  results: QueryResult[];
}
interface Session {
  userQuestion: string;
  draftAnswer: string;
  history: HistorySearch[];
  done?: boolean;
  critique: string;
}

function formatContent(c: string): string {
  if (Array.from(c.matchAll(/\|/g)).length > 10) {
    return c.replaceAll(/(\s|\|)+/g, " ");
  }
  return c;
}
function promptHistory(session: Session) {
  const MAX_LENGTH = 5000;
  if (session.history.length == 0) {
    return "No research queries have been performed";
  }
  let ret = `Previous Queries: ${session.history.map(h => `* ${h.q}\n`).join("")}`

  session.history.flatMap(h => h.results.filter(r => !r.presented)).forEach(r => {
    const chunk = `\n* <RESULT>${formatContent(
      r.content
        )}</RESULT>`;
    if (ret.length + chunk.length < MAX_LENGTH) {
      ret += chunk;
      r.presented = true
    }
  })
  return ret;
}

async function continueSession(session: Session, cycle=0): Promise<Session> {
  let sessionNext = JSON.parse(JSON.stringify(session)) as Session;
  let hx = promptHistory(sessionNext);
  let prompt = promptTemplate({
    critique: sessionNext.critique,
    userQuestion: sessionNext.userQuestion,
    draftAnswer: sessionNext.draftAnswer,
    history: hx
  })
  console.log(prompt, "^prompt");

  const completion = await util.completion({
    model: "text-davinci-003",
    temperature: 0.5,
    prompt,
    max_tokens: 1000,
  });

  const completionText = completion.choices[0].text;

  console.log(completionText);

  const nextStepSearchRaw = Array.from(
    completionText!
      .split("Critique Your Answer")[1]
      .matchAll(/SEARCH_FHIR_SPEC\((.*?)\)/gms),
    (r) => r[1]
  );

  const nextStepSearchSet = new Set(nextStepSearchRaw)
  for (const p in sessionNext.history.map(h => h.q)) {
    nextStepSearchSet.delete(p)
  }
  let nextStepSearch = Array.from(new Set(nextStepSearchSet))

  const nextCritique =
      completionText!
        .split("# Required Improvements")[1]
        .split("#")[0].trim();

  const nextStepReturn =
    Array.from(
      completionText!
        .split("Critique")[1]
        .matchAll(/RETURN_FINAL_ANSWER/gms)
    ).length > 0;
  if (nextStepReturn) {
    sessionNext.done = true;
    return sessionNext;
  }

  const nextDraftAnswer = completionText!
    .split("#")[0]
    .trim();

  if (cycle > 0) {
    sessionNext.draftAnswer = nextDraftAnswer;
    console.log("Updated session critique", nextCritique)
    sessionNext.critique = nextCritique || sessionNext.critique;
  } else {
    nextStepSearch = [session.userQuestion, ...nextStepSearch]
  }

  if (nextStepSearch.length > 0) {
    for (const q of nextStepSearch) {
      sessionNext.history.push({type: "SEARCH", q, results: await query(q) })
    }
  }

  return sessionNext;
}

const stepFile = () => `${Deno.args[0]}.${step}.json`;
const question = Deno.args[1];
let step = 0;
let session: Session = {
  userQuestion: question,
  draftAnswer: "(Not started yet.)",
  history: [],
  critique: `
 * If search results are relevant to the user's question, incorporate then. If not, ignore them.
 * Summarize a complete draft in easy-to-understand language
 * include references to the *.html pages of the FHIR spec
 * fix issues from your critique
 * simplify, simplify, simplify!  `
};

Deno.writeTextFileSync(stepFile(), JSON.stringify(session, null, 2));
while (step < 5) {
  try {
    session = await continueSession(session, step);
    Deno.writeTextFileSync(stepFile(), JSON.stringify(session, null, 2));
    if (session.done) {
      Deno.exit(0);
    }
  } catch (e) {
    console.error(e);
    console.error("Failed step", step);
  }
  step += 1;
  console.log("On to step", step);
}
