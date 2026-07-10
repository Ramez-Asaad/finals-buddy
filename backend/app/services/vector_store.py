import os
import json
import numpy as np
import math
import re
from typing import List, Dict, Any, Tuple

VECTOR_STORE_FILE = "vector_store.json"

def tokenize(text: str) -> List[str]:
    # Lowercase and extract alphanumeric words
    return re.findall(r'\b\w+\b', text.lower())

class SimpleVectorStore:
    def __init__(self):
        self.documents: List[Dict[str, Any]] = []
        self.embeddings: List[List[float]] = []
        self.load()

    def load(self):
        if os.path.exists(VECTOR_STORE_FILE):
            try:
                with open(VECTOR_STORE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.documents = data.get("documents", [])
                    self.embeddings = data.get("embeddings", [])
            except Exception as e:
                print(f"Error loading vector store: {e}")
                self.documents = []
                self.embeddings = []

    def save(self):
        try:
            # Write to a temporary file first, then rename (atomic write to prevent corruption)
            temp_file = f"{VECTOR_STORE_FILE}.tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump({
                    "documents": self.documents,
                    "embeddings": self.embeddings
                }, f, ensure_ascii=False, indent=2)
            if os.path.exists(temp_file):
                if os.path.exists(VECTOR_STORE_FILE):
                    os.remove(VECTOR_STORE_FILE)
                os.rename(temp_file, VECTOR_STORE_FILE)
        except Exception as e:
            print(f"Error saving vector store: {e}")

    def get_embedding(self, text: str) -> List[float]:
        # Always use local TF-IDF engine — no external embedding API needed
        return []

    def add_document(self, text: str, metadata: Dict[str, Any]):
        embedding = self.get_embedding(text)
        self.documents.append({
            "text": text,
            "metadata": metadata
        })
        self.embeddings.append(embedding)
        self.save()

    def remove_documents_by_metadata(self, filter_dict: Dict[str, Any]):
        new_docs = []
        new_embs = []
        for idx, doc in enumerate(self.documents):
            match = True
            for key, val in filter_dict.items():
                if doc["metadata"].get(key) != val:
                    match = False
                    break
            if not match:
                new_docs.append(doc)
                new_embs.append(self.embeddings[idx])
        self.documents = new_docs
        self.embeddings = new_embs
        self.save()

    def query(self, query_text: str, filter_metadata: Dict[str, Any] = None, k: int = 4) -> List[Tuple[Dict[str, Any], float]]:
        if not self.documents:
            return []

        # Filter documents by metadata first
        filtered_docs_with_indices = []
        for idx, doc in enumerate(self.documents):
            if filter_metadata:
                match = True
                for key, val in filter_metadata.items():
                    if doc["metadata"].get(key) != val:
                        match = False
                        break
                if not match:
                    continue
            filtered_docs_with_indices.append((idx, doc))

        if not filtered_docs_with_indices:
            return []

        # Check if we have valid OpenAI embeddings populated
        has_embeddings = (
            len(self.embeddings) == len(self.documents) and
            all(len(emb) > 0 for emb in self.embeddings)
        )

        results = []

        # Always use high-fidelity local TF-IDF search — fast, free, no API required
        # We prepend the filename to the document text here so that searching for the filename
        # naturally matches the chunks of that file (backward compatibility for old uploads)
        docs_texts = [f"Source File Name: {doc['metadata'].get('name', '')}\n\n{doc['text']}" for _, doc in filtered_docs_with_indices]
        doc_tokens = [tokenize(d) for d in docs_texts]
        query_tokens = tokenize(query_text)
        
        # Build local vocabulary from filtered docs + query
        vocab = set()
        for tokens in doc_tokens:
            vocab.update(tokens)
        vocab.update(query_tokens)
        vocab = list(vocab)
        vocab_index = {word: idx for idx, word in enumerate(vocab)}
        
        if not vocab:
            return [(doc, 0.0) for _, doc in filtered_docs_with_indices[:k]]

        # Compute Document Frequency (DF)
        df = {word: 0 for word in vocab}
        for tokens in doc_tokens:
            for token in set(tokens):
                df[token] += 1
                
        # Compute Inverse Document Frequency (IDF)
        N = len(docs_texts)
        idf = {}
        for word in vocab:
            idf[word] = math.log(1.0 + (N / (1.0 + df[word])))
            
        # Compute TF-IDF vectors for documents
        doc_vectors = []
        for tokens in doc_tokens:
            vec = [0.0] * len(vocab)
            if tokens:
                tf_counts = {}
                for token in tokens:
                    tf_counts[token] = tf_counts.get(token, 0) + 1
                for token, count in tf_counts.items():
                    tf = count / len(tokens)
                    vec[vocab_index[token]] = tf * idf[token]
            doc_vectors.append(vec)
            
        # Compute TF-IDF vector for query
        query_vector = [0.0] * len(vocab)
        if query_tokens:
            q_counts = {}
            for token in query_tokens:
                q_counts[token] = q_counts.get(token, 0) + 1
            for token, count in q_counts.items():
                if token in vocab_index:
                    tf = count / len(query_tokens)
                    query_vector[vocab_index[token]] = tf * idf[token]
                    
        # Compute cosine similarity
        q_norm = math.sqrt(sum(x*x for x in query_vector))
        for i, (idx, doc) in enumerate(filtered_docs_with_indices):
            vec = doc_vectors[i]
            doc_norm = math.sqrt(sum(x*x for x in vec))
            if q_norm > 0 and doc_norm > 0:
                dot_product = sum(q * d for q, d in zip(query_vector, vec))
                similarity = dot_product / (q_norm * doc_norm)
            else:
                similarity = 0.0
            results.append((doc, similarity))
            
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:k]

# Global single instance
vector_store = SimpleVectorStore()
