import { Questionnaire } from 'npm:@types/fhir';
import { encode, decode } from 'npm:gpt-3-encoder';
import * as util from "./util.ts";

function cleanseItems(items) {
  items.forEach(item => {
    delete item.extension;
    delete item.answerOption;
    delete item.enableWhen;
    delete item.code;
    if (item.item) cleanseItems(item.item);
  });
}

export default async function dialog(
  questionnaire: string
): Promise<unknown> {
  console.log(questionnaire);

  const response = await (await fetch(questionnaire, { headers: { Accept: 'application/fhir+json' } }));
  const q = await response.json() as Questionnaire;
  let updatedQ: Questionnaire = JSON.parse(JSON.stringify(q)) as Questionnaire;

  // Trim down the resource from some content that we don't really need for processing
  delete updatedQ.meta;
  delete updatedQ.contained;
  delete updatedQ.extension;
  cleanseItems(updatedQ.item);

  console.log(JSON.stringify(updatedQ, null, 2));

  // Substitute the description with one from GPT-3
  let promptDescription = `Provide a concise summary of what data this FHIR Questionnaire is capturing.
  Also include the purpose(s) of why this data would be collected.
  `
  promptDescription = promptDescription + "```json\r\n";
  promptDescription = promptDescription + JSON.stringify(updatedQ, null, 1);
  promptDescription = promptDescription + "```\r\n";

  // before we send the prompt to GPT-3, we need to encode it (and verify the number of tokens there are)
  const encodedData = await encode(promptDescription);
  console.log(encodedData);
  // for(let token of encodedData){
  //   console.log({token, string: decode([token])})
  // }

  if (encodedData.length > 4000) {
    console.error("Too many tokens!");
    return -1;
  }
  const completion = await util.completion({
    model: "text-davinci-003",
    prompt: promptDescription,
    temperature: 0.7,
    max_tokens: 512,
  });
  q.description = completion.choices[0].text!.trimStart();
  console.log(q.description);

  // Now proceed to deduce all the questions!

  return 0;
}

dialog(Deno.args[0])

