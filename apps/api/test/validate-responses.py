"""Validate real handler responses in memory against the adopted OpenAPI."""
import json
import pathlib
import sys

import yaml
from jsonschema import Draft202012Validator, FormatChecker

root = pathlib.Path(__file__).resolve().parents[3]
contract = yaml.safe_load((root / "docs/design/api/openapi.yaml").read_text())


def resolve(value):
    while "$ref" in value:
        target = contract
        for part in value["$ref"].removeprefix("#/").split("/"):
            target = target[part]
        value = target
    return value


rows = json.load(sys.stdin)
for index, row in enumerate(rows):
    operation = contract["paths"][row["path"]][row["method"].lower()]
    response = resolve(operation["responses"][str(row["status"])])
    schema = {**response["content"]["application/json"]["schema"], "components": contract["components"]}
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = list(validator.iter_errors(row["body"]))
    # Never echo the response value: it can contain a CSRF token.
    assert not errors, f"response {index}: schema violation at {[list(error.path) for error in errors]}"
    if "x-error-codes" in response:
        assert row["body"]["code"] in response["x-error-codes"], f"response {index}: undeclared error code"
    assert row["headers"]["cache-control"] == "no-store", f"response {index}: cache header"
    assert row["headers"]["x-fespay-contract-revision"] == "1", f"response {index}: revision"
    assert row["headers"]["x-fespay-min-write-revision"] == "1", f"response {index}: write revision"
print(f"Validated {len(rows)} real responses against OpenAPI")
