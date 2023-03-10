import filterRegex from "./filterRegex.ts";
import semanticExtract from "./semanticExtract.ts";
import * as util from "./util.ts";
import patient from "./synthea_jill.json" assert { type: "json" };

const db = patient.entry.map((e) => e.resource);

async function semanticExtractAll({
  filter,
  extract: template,
}: {
  filter: string;
  extract: Record<string, string>;
}) {
  const {isComplete, probes} = await filterRegex(filter);
  const matches = [];

  for (const r of db) {
    let matching = true;
    for (const [where, what] of probes) {
      const targets = Object.keys(r)
        .filter((k) => k.startsWith(where.slice(1)))
        .map((k) => JSON.stringify((r as any)[k]).toLowerCase())
        .join(" ");
      if (what.some((v) => targets.match(new RegExp(v.toLowerCase())))) {
        continue;
      } else {
        matching = false;
        break;
      }
    }
    if (matching) {
      matches.push(r);
    }
  }

  console.log("Probes filtered down to", matches.length, "complete?", isComplete);

  console.log("Sending these to semanticExtract for handling");
  let extraction = [];
  for (const r of matches.slice(0, util.MAX_RESOURCES)) {
    try {
      let extracted = await semanticExtract(r, filter, template);
      if (extracted?.evidence?.contradictory == 0) {
        extraction.push(extracted);
      } else {
        console.log("Poor evidence", extracted);
      }
    } catch (e) {
      console.log("Skipping failed extraction in extractAll", e);
    }
  }

  return extraction;
}

const promptTemplateDialog = `
Write javascript to extract data from a FHIR server in response to a question.


You can use:

${"```"}ts
interface SemanticExtract {
  filter: string, // natural language description of which resources to keep
  extract: Record<string, string> // map of arbitrary keys => natural language descriptions of values
}

declare function semanticExtractAll(template: SemanticExtract): Record<string, any>;

declare function answer(a: any) // return an answer when it's ready

await semanticExtractAll({
  filter: "FHIR Observation of blood pressure",
  extract: {
    t: "effective time ISO8601",
    v: "measured value"
  }
})
${"```"}

---
CONTEXT
today: {{input.today}}
---

Q. Do I have any BP readings outside the normal range?

Execute
${"```"}
const normalBpRange = {
  systolic: [100, 120],
  diastolic: [60, 80]
};

const bpReadingsOutsideNormalRange = await semanticExtractAll({
  filter: "FHIR Observation of blood pressure",
  extract: {
    systolic: "measured systolic value",
    diastolic: "measured diastolic value"
  }
}).filter(({systolic, diastolic}) => {
  return (
    systolic < normalBpRange.systolic[0] ||
    systolic > normalBpRange.systolic[1] ||
    diastolic < normalBpRange.diastolic[0] ||
    diastolic > normalBpRange.diastolic[1]
  );
});

answer(bpReadingsOutideNormalRange)
${"```"}

---

Q. What are my food allergies?

Execute
${"```"}
const foodAllergies = await semanticExtractAll({
  filter: "FHIR AllergyIntolerance to food",
  extract: {
    food: "allergen name"
  }
});

answer(foodAllergies);
${"```"}

---

Q. Do I have any heart problems?

Execute
${"```"}
const heartProblems = await semanticExtractAll({
  filter: "FHIR Condition or Observation about cardiovascular problem",
  extract: {
    name: "name of the problem"
  }
});

answer(heartProblems);
${"```"}

---

Q. How many appointment did I have last year?

Execute
${"```"}
const appointments = await semanticExtractAll({
  filter: "FHIR Encounter EpisodeOfCare or Appointment in 2022",
  extract: {
    t: "appointment time in ISO8601"
  }
});

answer(appointments.length);
${"```"}
---

Q. Who is my primary care doctor?

Execute
${"```"}
const primaryCareDoctor = await semanticExtractAll({
  filter: "FHIR Patient with primary care provider"
  extract: {
    name: "name of the primary care provider"
  }
});

answer(primaryCareDoctor);
${"```"}

---

Q. What is my home address?

Execute
${"```"}
const homeAddress = await semanticExtractAll({
  filter: "FHIR Patient with home address",
  extract: {
    address: "home address"
  }
});

answer(homeAddress);
${"```"}
---

Q. When did I first have general anaesthesia?

Execute
${"```"}
const anaesthesia = await semanticExtractAll({
  filter: "FHIR Procedure involving general anaesthesia",
  extract: {
    t: "effective time ISO8601"
  }
});

anaesthesia.sort((a, b) => a.t > b.t ? 1 : a.t == b.t ? 0 : -1)

answer(anaesthesia);
${"```"}
---

Q. Do I have more allergies than conditions?
Execute
${"```"}
const allergies = await semanticExtractAll({
  filter: "FHIR AllergyIntolerance",
  extract: {}
});

const conditions = await semanticExtractAll({
  filter: "FHIR AllergyIntolerance",
  extract: {}
});


answer(allergies.length > conditions.length);
${"```"}
---

Q. {{input.question}}

Execute
`;

let _answer;
function answer(a) {
  _answer = a;
}

export default async function dialog(question: string): Promise<unknown> {
  let prompt = promptTemplateDialog
    .replaceAll("{{input.question}}", question)
    .replaceAll("{{input.today}}", new Date().toISOString().slice(0, 10));

  const completion = await util.completion({
    model: "text-davinci-003",
    prompt,
    max_tokens: 512,
  });

  try {
    let extracted = completion.choices[0]
      .text!.match(/```.*```/gms)[0]
      .slice(3, -3);
    console.log(extracted);

    let result = await eval(
      `(async function(){${extracted}\nreturn _answer;})()`
    );
    console.log("Answered", result);
    return result;
  } catch (e) {
    return {} as any;
  }
}

dialog(Deno.args[0]);
