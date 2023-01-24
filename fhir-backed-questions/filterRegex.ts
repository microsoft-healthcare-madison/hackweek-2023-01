import * as util from "./util.ts";

const promptTemplateFilterRegex = `Probes for "FHIR AllergyIntolerance to a food that causes a skin condition, diagnosed before 2015":
* resource types: ["AllergyIntolerance"]
* food. Probes: ["food", "ingredient", "dietary"]
* skin condition. Probes: ["skin", "dermatologic", "rash"]
* diagnosed before 2015. I cannot perform relative comparison -> No probes.

Probes for "FHIR Condition diabetes diagnosed recorded after 1999":
* resource types: ["Condition", "Observation"]
* diabetes. Probes: ["diabetes", "blood glucose"]
* recorded after 1999. I cannot perform relative comparisons -> No probes.

Probes for "FHIR Condition diagnosed in 1990s":
* resource types: ["Condition", "Observation"]
* diagnoses in 1990s. Probes: ["199"]

Probes for "FHIR MedicationStatement":
* resource types: ["MedicationStatement", "MedicationRequest"]

Probes for "recent allergies":
* resource types: ["AllergyIntolerance"]
* recent. I cannot perform relative comparisons -> No probes.

---

In a moment you will decide on a set of filters to narrow down a large collection of resources, retaining just the ones that match a set of requirements. Think carefully. Break the requirements into logical units word by word, and turn each  requirements into a set of "probes" (short words, partial words, or phrases) to identify target resources.

MUST: Consider all resource types that could include this information
MUST: Output probes to ensure that at least one probe in the set will match any conceivable FHIR resource that meets the requirements
MUST NOT: Output probes with a different meaning from the query
MUST NOT: Output probes with generic words like "measurement"
MUST: Decline to output probes for relative concepts like comparisons, greater than, above, under, less than
MUST: Use synonyms to ensure complete coverage
MUST: Use synonyms from the FHIR specification when they apply

Probes for "{{input.filter}}":
*`;

export default async function filterRegex<T extends Record<string, string>>(
  filter: string
): Promise<string[][]> {
  let prompt = promptTemplateFilterRegex.replaceAll("{{input.filter}}", filter);
  console.log("Getting probes for", filter);

  const completion = await util.completion({
    model: "text-davinci-003",
    prompt,
    max_tokens: 512,
  });
  const fodder = completion.choices[0].text;

  try {
    let probes = Array.from((fodder || "").matchAll(/(\[.*?\])/gms), (m) =>
      util.looseJsonParse(m[0])
    );
    console.log(probes);
    return probes;
  } catch (e) {
    console.log("Failed to extract probes");
    return [];
  }
}

// let filter = Deno.args[0]
// let probes = await filterRegex(filter);
