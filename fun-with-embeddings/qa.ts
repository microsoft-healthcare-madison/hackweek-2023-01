import * as util from "./util.ts";

interface QueryResult {
  filename: string;
  chunk: number;
  content: string;
}

async function query(q: string, o = 0): Promise<QueryResult[]> {
  const cmd = Deno.run({
    cmd: ["python", "search.py", q],
    stdout: "piped",
  });
  const output = await cmd.output();
  cmd.close();
  const outputText = new TextDecoder().decode(output);
  const outputJson = JSON.parse(outputText);
  return outputJson as QueryResult[];
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
* RETURN_FINAL_ANSWER to provide your final answer

Be thorough. Do not return a final answer until you have done extensive searches to justify your answer.

At every step your output is a three-section markdown file containing:

---
# Critique of Draft Answer
(Here, review the current draft answer for accuracy and completeness. Document anything that can be improved)

# Updated Draft 
(Here, refine the draft answer based on your critique and all available information. You
 * MUST: summarize in easy-to-understand language
 * MUST: include references to the *.html pages of the FHIR spec
 * MUST: directly address the user's question
 * MUST NOT: include information outside of the user's question)

#  Research Plan
(Review your History of queries and articulate your thought process. Never
repeat a query; instead, plan to make novel helpful queries.  For example, if
the user asks "how can I model a panel of diabetic patients", and you see
Collapsed results, you would say "Thought: I know FHIR Group and List are
important, so I will get more information about how to decide between these. I
have already done SEARCH_FHIR_SPEC(when to use group vs list). To be thorough, I
will also SEARCH_FHIR_SPEC(patient panel) in case I am missing anything; I will
proceed until I have enough information."

#  Immediate Action
(Select your best immediate action. Never repeat queries. Choose from: SEARCH_FHIR_SPEC(some terms), RETURN_FINAL_ANSWER.)
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
    let frameEntry = `* ${
      h.type == "SEARCH" ? `SEARCH_FHIR_SPEC(${h.q})\n` : ``
    }`;
    if (h.type !== "SEARCH") {
      continue;
    }
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
      } else {
        if (j > h.presented) {
          frameEntryBullets += `  * Result ${j + 1}: (Collapsed) \n`;
        }
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
    .replaceAll("{{input.userQuestion}}", session.userQuestion)
    .replaceAll("{{input.draftAnswer}}", session.draftAnswer)
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

  let nextStepContinue = session.history.length > 0 && session.history.slice(-1)[0].presented < session.history.slice(-1)[0].results.length

  let nextDraftAnswer = completionText!
    .split("# Updated Draft Answer")[0]
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
  /*
  let prompt = promptTemplateSemanticExtract
    .replaceAll("{{input.resource}}", JSON.stringify(resource, null, 2))
    .replaceAll("{{input.filter}}", filter)
    .replaceAll(
      "{{input.extractionTemplate}}",
      Object.entries(template)
        .map(([key, description]) => `"${key}": // ${description}`)
        .join("\n")
    );
  const completion = await util.completion({
    model: "text-davinci-003",
    prompt,
    max_tokens: 512,
  });

  try {
    let extracted = util.looseJsonParse(
      completion.choices?.[0].text?.match(/\{(.*)\}/gms)?.[0] || "{}"
    );
    console.log("extracted", extracted);
    if (Object.keys(extracted).length == 0) {
      console.debug(completion.choices[0].text)
    }
    return extracted;
  } catch (e) {
    console.log("Could not extract", e)
    console.error(completion.choices[0].text)
    return {} as any;
  }
  */
}

// let q = Deno.args[0];
// qa(q);

const session = JSON.parse(Deno.readTextFileSync(Deno.args[0])) as Session;
let next = JSON.stringify(await continueSession(session), null, 2);
Deno.writeTextFileSync(Deno.args[1], next);
