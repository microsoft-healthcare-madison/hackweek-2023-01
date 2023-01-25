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

export const rbc = {
  "resourceType" : "Observation",
  "status" : "final",
  "category" : [
    {
      "coding" : [
        {
          "system" : "http://terminology.hl7.org/CodeSystem/observation-category",
          "code" : "laboratory",
          "display" : "Laboratory"
        }
      ],
      "text" : "Laboratory"
    }
  ],
  "code" : {
    "coding" : [
      {
        "system" : "http://loinc.org",
        "code" : "789-8",
        "display" : "RBC # Bld Auto"
      }
    ],
    "text" : "RBC # Bld Auto"
  },
  "subject" : {
    "reference" : "Patient/example",
    "display" : "Amy Shaw"
  },
  "effectiveDateTime" : "2005-07-05",
  "valueQuantity" : {
    "value" : 4.58,
    "unit" : "10*6/uL",
    "system" : "http://unitsofmeasure.org"
  },
  "referenceRange" : [
    {
      "low" : {
        "value" : 4.1,
        "unit" : "10*6/uL",
        "system" : "http://unitsofmeasure.org",
        "code" : "10*6/uL"
      },
      "high" : {
        "value" : 6.1,
        "unit" : "10*6/uL",
        "system" : "http://unitsofmeasure.org",
        "code" : "10*6/uL"
      },
      "type" : {
        "coding" : [
          {
            "system" : "http://terminology.hl7.org/CodeSystem/referencerange-meaning",
            "code" : "normal",
            "display" : "Normal Range"
          }
        ],
        "text" : "Normal Range"
      }
    }
  ]
}