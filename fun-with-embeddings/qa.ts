import * as util from "./util.ts";

interface QueryResult {
  filename: string;
  chunk: number;
  content: string;
  presented: boolean;
}

const RESULTS_PER_QUERY = 2;
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
    return outputJson
      .slice(0, RESULTS_PER_QUERY)
      .map((r: QueryResult) => ({ ...r, presented: false })) as QueryResult[];
  } catch (e) {
    console.log("Failed to query", q);
    return [];
  }
}

const RESULTS_PER_SNOMED_QUERY = 3;
async function querySnomed(t:string, q: string): Promise<QueryResult[]> {
  const vs = {
    snomed: "2.16.840.1.113762.1.4.1018.240",
    loinc: "observation-codes"
  }[t];
  if (!vs) {
    console.log("Canot look up VS ", vs);
    return []
  }

  const reqUrl = `https://tx.fhir.org/r4/ValueSet/${vs}/$expand?filter=${encodeURIComponent(
    q
  )}`;

  const resp = await (
    await fetch(reqUrl, { headers: { Accept: "application/fhir+json" } })
  ).json();

  const ret =
    ((resp?.expansion?.contains) || []).slice(0, RESULTS_PER_SNOMED_QUERY) || [];
  return [
    {
      filename: vs+".txt", // TODO remove these from the model or generalize so they make sense for vocab
      chunk: 0,
      content:
        "Each of the following terms matches " + q + ": "+
        JSON.stringify(ret, null, 2),
      presented: false,
    },
  ];
}

interface PromptInput {
  draftAnswer: string;
  userQuestion: string;
  critique: string;
  history: string;
}
const promptTemplate = ({
  draftAnswer,
  userQuestion,
  critique: _critique,
  history,
}: PromptInput) => `
You are a FHIR spec sherpa. Please answer user questions and provide small, simple example instances.

---

At every step, produce output for three tasks in "#" sections.

# 1. Critique of the Preliminary Answer
<TASK DESCRIPTION>
1a. List each detail the user asked about (sub-bullets for each detail)
1b. Determine whether the details has been supplied to satisfy the user
2a. List each detail of the response (sub-bullets for each detail)
2b. Determine whether the detail can be removed while satisfying the user's question
3a. List each FHIR element or coding used in the answer
3b. Determine whether it has been verified in the research log, or if a new query is needed

Play the role of a picky reviewer to determine how to make the answer correct and as short as possible. Be sure to include resource examples and markdown links to the FHIR spec, when relevant. Be sure that all details have been researched in the query log. What new SEARCH_FHIR($queryInEnglish) or SEARCH_VOCAB(snomed | loinc, description) queries can improve the answer quality?

</TASK DESCRIPTION>

# 2. Your Answer
<TASK DESCRIPTION>
Ready the critique carefully. Now fix those problems in a new answer, written in the 2nd person. Pay specific attention to any Required Improvements. Apply these improvements to produce a new, compelling answer to the user's question, no more and no less. If any <RESULT>s from the Research Log are directly relevant for the user, incorporate them. Otherwise, ignore the <RESULT>s.

Next, output "## Required Additional Searches" including bullets to SEARCH_FHIR for any data model or narrative text that will guide you, or SEARCH_VOCAB(snomed | loinc, description in english) for any codings, using english language arguments for the description. SEARCH_VOCAB can check any codings in your examples. Example syntax: SEARCH_VOCAB(snomed, hypertension), SEARCH_VOCAB(loinc, systolic blood pressure). Make sure you search the FHIR spec to find the best answers, and to confirm all details of your response.
</TASK DESCRIPTION>

# 3. Immediate Action
<TASK DESCRIPTION>
Select your next step as a single action
* IMPROVE_ANSWER if further research or improvements are needed
* RETURN_FINAL_ANSWER if this is complete and correct
</TASK DESCRIPTION>

---
# Current Session

## Today's Date
${new Date().toISOString().slice(0, 10)}

## Preferred Codings

Observation.code: use loinc
Condition.code: use snomed

## User Question
${userQuestion}

${
  draftAnswer
    ? `## Preliminary Answer 
${draftAnswer}`
    : ""
}

## Research Log
${history}

---OUTPUT 3 PARTS BELOW---

# 1. Critique of the Preliminary Answer
`;

interface HistorySearch {
  type: "SEARCH";
  subtype: string,
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

  let ret = `Previous Queries:\n${session.history
    .map((h) => `* Search ${h.subtype}: ${h.q}\n`)
    .join("")}`;


  let added = false;
  session.history
    .flatMap((h) => h.results.filter((r) => !r.presented))
    .forEach((r) => {
      const chunk = `\n* <RESULT>${formatContent(r.content)}</RESULT>`;
      if (ret.length + chunk.length < MAX_LENGTH) {
        if (!added) {
          ret += "\n## Search Results Page (ephemeral; use them in your answer immediately)\n"
        }
        ret += chunk;
        r.presented = true;
        added = true
      }
    });
  return ret;
}

async function continueSession(session: Session, cycle = 0): Promise<Session> {
  let sessionNext = JSON.parse(JSON.stringify(session)) as Session;
  let hx = promptHistory(sessionNext);
  let prompt = promptTemplate({
    critique: sessionNext.critique,
    userQuestion: sessionNext.userQuestion,
    draftAnswer: sessionNext.draftAnswer,
    history: hx,
  });
  console.log(prompt, "^prompt");

  const completion = await util.completion({
    model: "text-davinci-003",
    temperature: 0.0,
    prompt,
    max_tokens: 1000,
  });

  const completionText = completion.choices[0].text;

  console.log(completionText);

  const searchesToTerms = (re: RegExp): string[] =>
    [
      ...new Set(
        Array.from(
          completionText!.split("Additional Searches")?.[1]?.matchAll(re) || [],
          (r) => r[1]
        )
      ),
    ].filter((t) => !sessionNext.history.map((h) => h.q).includes(t));

  const requestedSearchesSnomed = searchesToTerms(/SEARCH_VOCAB\((.*?)\)/gms);
  const requestedSearchesFhir = (
    cycle == 0 ? [session.userQuestion] : []
  ).concat(searchesToTerms(/SEARCH_FHIR\((.*?)\)/gms));

  const nextCritique = completionText!
    .split(/^# /gms)?.[0]
    ?.trim();

  const nextDraftAnswer = completionText!.split("Your Answer")?.[1]?.split("#")?.[0].trim();

  if (cycle > 0) {
    sessionNext.draftAnswer = nextDraftAnswer;
    sessionNext.critique = nextCritique || sessionNext.critique;
  } else if (requestedSearchesSnomed.length > 0) {
    for (const q of requestedSearchesSnomed) {
      const [v, t]: string[] = q.split(", ", 2);
      sessionNext.history.push({
        type: "SEARCH",
        subtype: v,
        q,
        results: await querySnomed(v, t),
      });
    }
  }
  if (requestedSearchesFhir.length > 0) {
    for (const q of requestedSearchesFhir) {
      sessionNext.history.push({
        type: "SEARCH",
        q,
        results: await query(q),
        subtype: "FHIR",
      });
    }
  }

  const nextStepReturn =
      !!completionText?.match(/RETURN_FINAL_ANSWER/gms)

  if (
    nextStepReturn &&
    cycle > 0 && 
    sessionNext.history.flatMap((q) => q.results).every((r) => r.presented)
  ) {
    sessionNext.done = true;
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
 * Look for RESULTs. Some RESULTS are safe to ignore. Only pay attention to directly relevant RESULTs.
 * Summarize an answer in easy-to-understand language
 * include references to the *.html pages of the FHIR spec
 * fix issues from your critique
 * simplify! Omit needless content.\n`,
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
