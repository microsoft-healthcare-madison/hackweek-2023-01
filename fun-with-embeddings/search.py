import os
import openai
import sys
import time

from dotenv import load_dotenv
load_dotenv()

q = sys.argv[1]
offset = sys.argv[2] if len(sys.argv)>2 else "0"
offset = int(offset)
openai.api_key = os.environ['OPENAI_API_KEY']

import numpy as np
from pymilvus import (
    connections,
    utility,
    FieldSchema,
    CollectionSchema,
    DataType,
    Collection,
)
connections.connect("default", host="localhost", port="19530")

fields = [
    FieldSchema(name="pk", dtype=DataType.INT64, is_primary=True, auto_id=False),
    FieldSchema(name="filename", dtype=DataType.VARCHAR, max_length=128),
    FieldSchema(name="core", dtype=DataType.BOOL),
    FieldSchema(name="definition", dtype=DataType.BOOL),
    FieldSchema(name="example", dtype=DataType.BOOL),
    FieldSchema(name="valueset", dtype=DataType.BOOL),
    FieldSchema(name="chunk", dtype=DataType.INT16),
    FieldSchema(name="embeddings", dtype=DataType.FLOAT_VECTOR, dim=1536)
]
query_embedding = openai.Embedding.create(input = [q], model="text-embedding-ada-002")['data'][0]['embedding']

import json
with open("./chunks.json") as chunks:
    filename_to_chunks = json.load(chunks)

for i in range(10):
    try:
        schema = CollectionSchema(fields, "FHIR Spec embedded by openai")
        fhir_milvus = Collection("fhir_spec_txt", schema)
        fhir_milvus.load()

        search_params = {"metric_type": "L2", "params": {}, "offset": 0}

        results = fhir_milvus.search(
            data=[query_embedding],
            anns_field="embeddings",
            param=search_params,
            output_fields=['filename', 'chunk'],
            limit=10,
            expr="core==true",
        )[0]

        output = []
        for hit in results:
            chunk = filename_to_chunks[hit.entity.get('filename')][hit.entity.get('chunk')]
            output.append({'filename': hit.entity.get('filename'), 'chunk': hit.entity.get('chunk'), 'content': chunk})
        print(json.dumps(output))
        sys.exit(0)
    except SystemExit:
        sys.exit(0)
    except: 
        time.sleep(.5)
        pass
