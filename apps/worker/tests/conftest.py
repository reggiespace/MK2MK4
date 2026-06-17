import sys
from pathlib import Path

# Make the worker package importable from the tests dir.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
