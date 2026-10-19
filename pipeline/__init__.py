"""Python side of the Verian concept: reference engine, data build and evaluation.

Modules
-------
engine    Reference implementation of the evidence engine (port of src/engine).
jsmath    Bit-exact ports of V8's Math.log and Math.log2, used by the engine.
validate  Strict validation of the library YAML and the gold questions.
evaluate  Strategy evaluation on the gold questions, the abstention study and
          the cross-language parity table.
build     Command-line build: ``python3 -m pipeline.build``.
"""
