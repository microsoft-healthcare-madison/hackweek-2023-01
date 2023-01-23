import "https://deno.land/x/dotenv/load.ts";
import zulipInit from "npm:zulip-js@2";
import { OpenAI } from 'https://deno.land/x/openai/mod.ts';
import { Configuration, OpenAIApi } from "npm:openai@3"



const url = Deno.args[0];
const parsedUrl = url.match(/stream\/(\d+).*\/topic\/(.+)/);
const stream = parseInt(parsedUrl[1]);
const topic = decodeURIComponent(parsedUrl[2].replaceAll('.20', '%20').replaceAll('.2E', '.'));

const env = Deno.env.toObject();
const config = {
  username: env.ZULIP_USERNAME,
  apiKey: env.ZULIP_PASSWORD,
  realm: env.ZULIP_REALM,
};


const openaiConfig = new Configuration({apiKey: env.OPENAI_API_KEY});

const openai = new OpenAIApi(openaiConfig);

(async () => {
  const client = await zulipInit(config);

    const readParams = {
        anchor: "newest",
        num_before: 100,
        num_after: 0,
        narrow: [{"operator": "stream", operand: stream},
            {"operator": "topic", operand: topic}],
    };

    const hx = (await client.messages.retrieve(readParams))
    const promptHx = hx.messages.map(({sender_full_name, content}) => `${sender_full_name}:${content}\n`).join("\n");

    const prompt = `In the role of a FHIR community advocate, please use dialog to draft a single FAQ entry for the FHIR Community FAQ. You'll need to know: What would the question be, and what would the answer be? From 0-100, how important is this FAQ for the community?

SHOULD: summarize in general terms for community reading
MUST: ontput only a single JSON block the the form:

${"```json"}
{
  "q": // question for faq
  "a": // answer for faq
  "importance": // 0-100
}
${"```"}
---

Discussion from chat.fhir.org:
${promptHx}

Output:
`;

const completion = await openai.createCompletion({
  model: "text-davinci-003",
  prompt: prompt,
  max_tokens: 256
});

//console.log(completion);
//console.log(JSON.stringify(completion.data, null, 2));

const jsonOut = JSON.parse(completion.data.choices[0].text.match(/\{(.*)\}/gms)[0])

console.log(JSON.stringify(jsonOut, null, 2));
})();
