import * as util from "./util.ts";

interface QueryResult {
  filename: string;
  chunk: number;
  content: string;
}

const RESULTS_PER_QUERY = 5;
async function query(q: string, o = 0): Promise<QueryResult[]> {
  const cmd = Deno.run({
    cmd: ["python", "search.py", q],
    stdout: "piped",
  });
  const output = await cmd.output();
  cmd.close();
  const outputText = new TextDecoder().decode(output);
  const outputJson = JSON.parse(outputText);
  return outputJson.slice(0,RESULTS_PER_QUERY) as QueryResult[];
}


let promptTemplate = `
# Session State

## User Question
{{input.userQuestion}}

## Draft Answer
{{input.draftAnswer}}

## History
{{input.history}}
---
You are a FHIR community lead. Your role is to answer complex answer user questions with precision and grace. You can:

* SEARCH_FHIR_SPEC(some terms) to gather data that will help you answer the user's question.
  * MUST: Infer the user's intent and consider use your FHIR knowledge to identify relevant search terms
  * MUST NOT: repeat previous searches 
  * MUST NOT: just pass along the user's question
  * Examples: SEARCH_FHIR_SPEC(medication resource background), SEARCH_FHIR_SPEC(observation resource search parameters), SEARCH_FHIR_SPEC(group vs list resource)
* RETURN_FINAL_ANSWER to provide your final answer

Be thorough. Do not return a final answer until you have done extensive searches to justify your answer.

At every step your output is a three-section markdown file containing:

---
# Critique of Draft Answer
(Will the user be satisfied with the current answer? Is anything incorrect, or do you need to fact-check anything? Have you included references? Is there any extraneous info? Importantly, can any sentences be removed or reorganized?)

# Updated Draft Answer
(Here, refine the draft answer based on your critique and all available information. You
 * MUST: summarize in easy-to-understand language
 * MUST: include references to the *.html pages of the FHIR spec
 * MUST: directly address the user's question
 * MUST NOT: include information beyond the user's question)

#  Research Plan
(Formulate a three-step research plan to gather and check your facts. What searches do you want to run? You can look for information about resources, search parameters, valuesets, etc. You want to establish references for every part of your answer.)

#  Immediate Action
(Select your next action, based on the analysis above. Never repeat a query from your history. You can: SEARCH_FHIR_SPEC(some terms) or  RETURN_FINAL_ANSWER.)
---OUTPUT BELOW---

# Critique of Draft Answer
`;

interface HistorySearch {
  type: "SEARCH";
  q: string;
  results: QueryResult[];
  presented: number;
}
interface Session {
  userQuestion: string;
  draftAnswer: string;
  history: (HistorySearch )[];
}

function formatContent(c: string): string {
  if (Array.from(c.matchAll(/\|/g)).length > 10) {
    return c.replaceAll(/(\s|\|)+/g, " ");
  }
  return c;
}
function promptHistory(session: Session) {
  const MAX_LENGTH = 4000;
  let frame = "";
  if (session.history.length == 0) {
    return "(Research not yet started.)";
  }
  for (let i = session.history.length - 1; i >= 0; i--) {
    const h = session.history[i];
    let frameEntry = ``;
    let frameEntryBullets = ``;
    for (let j = 0; j < h.results.length; j++) {
      if (i < session.history.length - 1) {
        continue;
      }
      if (
        j >= h.presented &&
        frame.length + frameEntry.length + frameEntryBullets.length < MAX_LENGTH
      ) {
        frameEntryBullets += `  * Result ${j + 1}: <RESULT>${formatContent(
          h.results[j].content
        )}</RESULT>\n`;
        h.presented++;
      }
    }
    frameEntry += frameEntryBullets;
    frame = frameEntry + "\n" + frame;
  }
  return frame;
}

async function continueSession(session: Session): Promise<Session> {
  let sessionNext = JSON.parse(JSON.stringify(session)) as Session;

  let prompt = promptTemplate
    .replaceAll("{{input.userQuestion}}", sessionNext.userQuestion)
    .replaceAll("{{input.draftAnswer}}", sessionNext.draftAnswer)
    .replaceAll("{{input.history}}", promptHistory(sessionNext));
  console.log(prompt, "^prompt");

  const completion = await util.completion({
    model: "text-davinci-003",
    temperature: 0.5,
    prompt,
    max_tokens: 1000,
  });

  let completionText = completion.choices[0].text;

  console.log("completion", completionText);

  let nextStepSearch = Array.from(
    completionText!
      .split("Immediate Action")[1]
      .matchAll(/SEARCH_FHIR_SPEC\((.*?)\)/gms),
    (r) => r[1]
  )[0];

  let nextStepContinue = sessionNext.history.length > 0 && sessionNext.history.slice(-1)[0].presented < sessionNext.history.slice(-1)[0].results.length

  let nextDraftAnswer = completionText!
    .split("Updated Draft Answer")[1]
    .split("#")[0]
    .trim();

  sessionNext.draftAnswer = nextDraftAnswer;

  if (!nextStepContinue && nextStepSearch) {
    sessionNext.history.push({
      type: "SEARCH",
      q: nextStepSearch.replaceAll('"', "").replaceAll("'", ""),
      results: await query(nextStepSearch),
      presented: 0,
    });
  }

  return sessionNext;
}

export default async function qa(question: string): Promise<string> {
  const session = {
    userQuestion: question,
    draftAnswer: "(Not started yet.)",
    history: [],
  };
  const response = await continueSession(session);
  console.log(JSON.stringify(response, null, 2));
  return "Done";
}

const stepFile = () => `${Deno.args[0]}.${step}.json`
const question = Deno.args[1];
let step = 0;
let session: Session = {
  userQuestion: question,
  draftAnswer: "(Not started yet.)",
  history: [],
};

Deno.writeTextFileSync(stepFile(), JSON.stringify(session, null, 2));
while (step < 5) {
  try {
    session = await continueSession(session);
    Deno.writeTextFileSync(stepFile(), JSON.stringify(session, null, 2));
  } catch {
    console.error("Failed step", step)
  }
  step += 1;
  console.log("On to step", step)
}