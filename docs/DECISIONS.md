# Engineering decisions

## Keep the demo small
Show the control pattern clearly. Do not simulate a full commerce platform.

## No external model dependency in the public demo
Clone and run without credentials. The proposal layer is deterministic; an AI provider can replace that component without weakening the control gates.

## Synthetic data only
Fixtures, rules, categories, names, and workflows are invented for this repository. No employer code, internal endpoints, credentials, datasets, or proprietary rules.

## Test failure paths, not only the happy path
The suite covers approval bypass, forbidden write fields, duplicate operations, incomplete readiness, ambiguous evidence, and post-write mismatch.
