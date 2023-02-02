import * as util from "./util.ts";
import * as prompts from "./prompts.ts";

interface Session {
  userQuestion: string;
  answer: string;
  results: { query: string; result: string }[];
  history: { query: string }[];
  done?: boolean;
}

const LAST_CYCLE = 5;
async function continueSession(session: Session, cycle = 0): Promise<Session> {
  const sessionNext = JSON.parse(JSON.stringify(session)) as Session;
  const stepType: "initialize" | "refine" | "finalize" =
    cycle == 0 ? "initialize" : cycle < LAST_CYCLE ? "refine" : "finalize";
  const promptForStep = prompts[stepType](session);

  console.log(promptForStep, "^prompt");

  const completion = await util.completion({
    model: "text-davinci-003",
    temperature: 0.25,
    prompt: promptForStep,
    max_tokens: 1200,
  });

  let completionText = completion.choices[0].text;
  console.log(completionText);
  // if (completionText?.includes("# Updated Answer Template")) {
  //   completionText = completionText.split("# Updated Answer Template")[1]
  // }

  sessionNext.answer = completionText!;

  if (stepType !== "finalize") {
    const tasks: { dependsOn: number[]; query: string; returns: string }[] =
      Array.from(
        completionText!.matchAll(
          /(dependsOn="(.*?)")? query="(.*?)"\s+returns="(.*?)"/g
        ),
        (r) => ({
          dependsOn:
            r[2]
              ?.split(",")
              .map(parseInt)
              .filter((x) => !!x) || [],
          query: r[3],
          returns: r[4],
        })
      ).filter((t) => !session.history.map((r) => r.query).includes(t.query));
    tasks.sort(
      (a, b) =>
        1000 * a.dependsOn.length +
        a.query.length -
        1000 * b.dependsOn.length -
        b.query.length
    );

    console.log(tasks);
    const immediateTask = tasks[0];
    if (immediateTask) {
      const result = prompt(`Query ${immediateTask.query} for ${immediateTask.returns}`)!;
      const results = [{ query: immediateTask.query, result }];
      sessionNext.results = results;
      sessionNext.history = [...sessionNext.history, ...results];
    } else {
      session.done = true;
    }
  }

  return sessionNext;
}

const stepFile = () => `${Deno.args[0]}.${step}.json`;
const question = Deno.args[1];
let step = 0;
let session: Session = {
  userQuestion: question,
  answer: "(Not started yet.)",
  results: [],
  history: [],
};

Deno.writeTextFileSync(stepFile(), JSON.stringify(session, null, 2));
while (step <= LAST_CYCLE) {
  try {
    session = await continueSession(session, step);
    Deno.writeTextFileSync(stepFile(), JSON.stringify(session, null, 2));
    if (step < LAST_CYCLE && session.done === true) {
      console.log("No more tasks; finalizing early");
      step = LAST_CYCLE - 1;
    }
  } catch (e) {
    console.error(e);
    console.error("Failed step", step);
  }
  step += 1;
  console.log("On to step", step);
}
