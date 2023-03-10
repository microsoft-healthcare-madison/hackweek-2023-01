import { Questionnaire } from 'npm:@types/fhir';
import GPT3Tokenizer from 'npm:gpt3-tokenizer';
import * as util from "./util.ts";
import * as YAML from 'npm:yaml';

function cleanseItems(items) {
  if (!items) return;
  items.forEach(item => {
    delete item.linkId;
    delete item.definition;
    delete item._text;
    delete item.extension;
    delete item.answerOption;
    delete item.answerValueSet;
    delete item.enableWhen;
    delete item.code;
    delete item.type;
    if (item.repeats === false) delete item.repeats;
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

  console.log(YAML.stringify(updatedQ, null, 2));

  // Substitute the description with one from GPT-3
  let promptDescription = `Provide a concise summary of what data this FHIR Questionnaire is capturing (include details from an existing description already included).
  Also include the purpose(s) of why this data would be collected.
  `
  promptDescription = promptDescription + "```yaml\r\n";
  promptDescription = promptDescription + YAML.stringify(updatedQ, null, 1);
  promptDescription = promptDescription + "```\r\n";

  // before we send the prompt to GPT-3, we need to encode it (and verify the number of tokens there are)
  const tokenizer = new GPT3Tokenizer.default({ type: 'codex' }); // or 'gpt3'
  const encoded: { bpe: number[]; text: string[] } = tokenizer.encode(promptDescription);

  if (encoded.text.length > 4000) {
    console.error(`Too many tokens! ${encoded.text.length}`);
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
  console.log(completion.usage?.prompt_tokens + ' tokens in the prompt, ' + encoded.text.length + ' tokens in the encoded prompt');

  // Now proceed to deduce all the questions!

  return 0;
}

dialog(Deno.args[0])

