import "https://deno.land/x/dotenv@v3.2.0/load.ts";
import {Configuration, CreateCompletionRequest, OpenAIApi } from "npm:openai@3";
export {default as looseJsonParse} from "npm:loose-json@1"

const env = Deno.env.toObject();
const openaiConfig = new Configuration({ apiKey: env.OPENAI_API_KEY });
const openai = new OpenAIApi(openaiConfig);
export const MAX_RESOURCES = parseInt(env.MAX_RESOURCES || "3");

export const completion = async (params: CreateCompletionRequest, ) => {
  const completion = await openai.createCompletion(params);
  // console.log(JSON.stringify(completion.data, null, 2))
  return completion.data
}
