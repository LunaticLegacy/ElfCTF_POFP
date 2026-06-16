from pathlib import Path

from modules.llmfetcher.rag_module.knowledge_base import KnowledgeBase, KnowledgeDocument, KnowledgeChunk
from modules.llmfetcher.rag_module.knowledge.markdown_loader import MarkdownKnowledgeLoader
from modules.llmfetcher.rag_module.knowledge.text_utils import TextTools


def test_chunk_document_splits_on_headings():
    text_tools = TextTools(excerpt_chars=120, embedding_max_chars=1000, chunk_max_chars=80)
    document = KnowledgeDocument(
        absolute_path=Path('/tmp/example.md'),
        root_relative_path='kb/example.md',
        repository_relative_path='kb/example.md',
        title='Example Doc',
        content='# Intro\nAlpha beta gamma.\n\n## Details\nDelta epsilon zeta.\n\nTail paragraph.',
    )

    chunks = text_tools.chunk_document(document)

    assert len(chunks) >= 2
    assert all(isinstance(chunk, KnowledgeChunk) for chunk in chunks)
    assert chunks[0].source_path == 'kb/example.md'
    assert chunks[0].chunk_index == 0
    assert chunks[0].heading_path.startswith('Intro') or chunks[0].heading_path == 'Example Doc'
    assert any('Details' in chunk.heading_path for chunk in chunks)


def test_knowledge_base_exports_and_root_availability():
    kb = KnowledgeBase(Path.cwd() / 'kb')

    assert kb.available()
    assert isinstance(kb.root, Path)


def test_knowledge_base_can_read_chunk_content():
    kb = KnowledgeBase(Path.cwd() / 'kb')
    hit = kb.search('UPX', limit=1)[0]

    chunk_text = kb.get_chunk_text_from_hit(hit)

    assert chunk_text is not None
    assert 'UPX' in chunk_text or len(chunk_text) > 0
    assert hit.chunk_key
    assert hit.chunk_index >= 0


def test_kbignore_excludes_marked_directories(tmp_path):
    repo_root = tmp_path / 'repo'
    kb_root = repo_root / 'kb'
    ignored_dir = kb_root / 'case-studies' / 'drafts'
    kept_dir = kb_root / 'case-studies' / 'reviewed'
    ignored_dir.mkdir(parents=True)
    kept_dir.mkdir(parents=True)

    (kb_root / '.kbignore').write_text('case-studies/drafts/\n', encoding='utf-8')
    (kb_root / 'case-studies' / 'README.md').write_text('# Case Studies\n', encoding='utf-8')
    (ignored_dir / 'draft.md').write_text('# Draft\nignored\n', encoding='utf-8')
    (kept_dir / 'reviewed.md').write_text('# Reviewed\nkept\n', encoding='utf-8')

    loader = MarkdownKnowledgeLoader(kb_root)
    documents = loader.load_documents()

    repository_paths = {document.repository_relative_path for document in documents}

    assert 'kb/case-studies/reviewed/reviewed.md' in repository_paths
    assert 'kb/case-studies/drafts/draft.md' not in repository_paths
