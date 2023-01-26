import "https://deno.land/x/dotenv@v3.2.0/load.ts";
export {default as jsonPath} from "npm:jsonpath@1";

import {Configuration, CreateCompletionRequest, CreateCompletionResponse, OpenAIApi } from "npm:openai@3";
export {default as looseJsonParse} from "npm:loose-json@1"

const env = Deno.env.toObject();
const openaiConfig = new Configuration({ apiKey: env.OPENAI_API_KEY });
const openai = new OpenAIApi(openaiConfig);

export const completion = async (params: CreateCompletionRequest, ): Promise<CreateCompletionResponse>=> {
  const completion = await openai.createCompletion(params);
  // console.log(JSON.stringify(completion.data, null, 2))
  return completion.data
}