import sys
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from modules.rag.knowledge_base import KnowledgeBase, KnowledgeHit, KnowledgeIndexEntry

def test_kb_usable():
    kb = KnowledgeBase(
        root=Path.cwd() / "kb"
    )
    
    result = kb.search("RE")
    print(result)
    print(result.__len__())

    pass

if __name__ == "__main__":
    test_kb_usable()
