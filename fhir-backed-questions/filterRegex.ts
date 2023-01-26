import * as util from "./util.ts";

const promptTemplateFilterRegex = `Analysis for "FHIR AllergyIntolerance to an edible substance that causes a skin condition, diagnosed before 2015".

Thoughts: I can't compare dates. Resource types are AllergyIntolerance.  "to an edible substance" means the category is food. "causes" refers to .reaction.

Output
[
  [".resourceType", ["AllergyIntolerance]],
  [".category", ["food", "edible"]],
  [".reaction", ["skin", "dermatologic", "rash"]],
]

Complete filter? No. I'm missing logic for dates.
---
Analysis for "What is my blood glucose"?

Thoughts: Resource types would be Observation. blood glucose would be Observation.code.

Output
[
  [".resourceType", ["Observation"]],
  [".code", ["glucose"]],
]

Complete filter? No. The code filter is not specific enough.
---
Analysis for "FHIR Condition diabetes diagnosed recorded after 1999".

Thoughts: I can't compare dates. the Resource types would be Condition or Observation. diabetes would be Condition.code or Observation.code.

Output
[
  [".resourceType", ["Condition", "Observation"]],
  [".code", ["diabetes", "diabetic"]],
]

Complete filter? No. The code filter is not specific enough.
---
Analysis for "FHIR Condition diagnosed in 1990s".

Thoughts: The 1990s would always have "199". Resource types would be Condition.

Output
[
  [".resourceType", ["Condition"]],
  [".effective", ["199"]]
]

Complete filter? Yes.
---
Analysis for "FHIR MedicationStatement".

Thoughts: resource types would be be Medication*.

Output
[
  [".resourceType", ["Medication"]]
]

Complete filter? Yes.
---

In a moment you will decide on a set of filters to narrow down a large collection of resources, retaining just the ones that match a set of requirements. Think carefully. Break the requirements into logical units word by word, and turn each requirement into a "path" and a set of "probes" (short words, partial words, or phrases). One or more of the probes needs to be present at the specified path.

MUST: Consider all resource types that could include this information
MUST: Use synonyms from the FHIR specification when they apply
MUST: Output one-word probes
MUST NOT: Output multi-word phrase probes
MUST NOT: Output probes with generic words like "measurement"
MUST NOT: Output probes that test the .subject or .patient

Analysis for "{{input.filter}}".

Thoughts:`;

export default async function filterRegex<T extends Record<string, string>>(
  filter: string
): Promise<{ isComplete: boolean; probes: [string, string[]][] }> {
  let prompt = promptTemplateFilterRegex.replaceAll("{{input.filter}}", filter);
  console.log("Getting probes for", filter);

  const completion = await util.completion({
    model: "text-davinci-003",
    prompt,
    max_tokens: 512,
  });

  const fodder = completion.choices[0].text!;
  console.log(fodder);

  try {
    const isComplete = !!fodder.match(/complete filter: yes/);
    const probes: [string, string[]][] = util.looseJsonParse(
      fodder.match(/(\[.*\])/gms)
    );
    console.log(probes);

    // touch-ups; generalize these if they're useful
    for (const p of probes) {
      const v = p[1];
      if (v.includes("MedicationOrder") && !v.includes("MedicationStatement")) {
        v.push("MedicationStatement");
      }
    }
    return { isComplete, probes };
  } catch (e) {
    console.log("Failed to extract probes");
    return { isComplete: false, probes: [] };
  }
}

// let filter = Deno.args[0]
// let probes = await filterRegex(filter);
