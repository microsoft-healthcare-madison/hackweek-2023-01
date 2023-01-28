# FHIR Q&A

* Install milvus via docker
* Run `tar -xzvf narrative.tgz`
* Run `tar -xzvf embeddings.tgz`
* Load data into milvus

## Rebuild the indexes
* Run `setup-spec.sh`
* Install Jupyter notebook and run embeddings notebook
* Set up `.env` file


    deno run --allow-all qa.ts fitbit "How can I represent step counts from my fitbit?"
