import * as util from "./util.ts";

interface WithEvidence {
  evidence: {
    consistent: number;
    contradictory: number;
    unclear: number;
  };
}

let promptTemplateSemanticExtract = `
Example bullet list analysis for "male patient born in 1970s":
* patient. resource is a patient => consistent 
* born in 1970s. resource has birthdate 1973-02-05, which is in the 1970s  => consistent
* male. The resource has no gender => unknown
* in California. The resource has home address in Nevada, which is not in California => inconsistent 

Output
{
  "evidence": { // skipped to save space

---
{{input.resource}}
---

In a moment you will decide if the resource is consistent with the requirements "{{input.filter}}" Think carefully. Break the requirements into logical units word by word. For each unit, determine whether the resource:

* explicitly meets the logical unit -- call this consistent 
* includes information that cannot be true given the unit -- call this contradictory
* provides no information about the unit -- call this unclear

MUST: output the bullet list analysis
MUST: below the analysis, output final results in JSON like

Output
{
"evidence": {
  "consistent" // number of requirements supported by the resource
  "contradictory" // number of  requirements inconsistent contradicted by the resource
  "unclear" // number of requirements with indeterminate status
},
{{input.extractionTemplate}}
}

Provide a null value for anything you cannot determine.
---

Bullet list for "
`;
export default async function semanticExtract<T extends Record<string, string>>(
  resource: any,
  filter: string,
  template: T
): Promise<Record<keyof T, string> & WithEvidence> {
  let prompt = promptTemplateSemanticExtract
    .replaceAll("{{input.resource}}", JSON.stringify(resource, null, 2))
    .replaceAll("{{input.filter}}", filter)
    .replaceAll(
      "{{input.extractionTemplate}}",
      Object.entries(template)
        .map(([key, description]) => `"${key}": // ${description}`)
        .join("\n")
    );
  console.log("Semantic extract", resource, filter, template);

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
    return {} as any;
  }
}

// let extracted = await semanticExtract(
//   util.rbc,
//   "red blood cell measurement before 1990",
//   {
//     count: "erythrocyte count per microliter",
//     cat: "category assigned to result",
//   }
// );
