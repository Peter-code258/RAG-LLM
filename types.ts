export interface RetrievedChunk {
  id: string;
  source: string;
  content: string;
  relevance_score: number;
}

export interface CorrectionStep {
  round: number;
  reasoning: string;
  modified_part: string;
}

export interface ProcessLog {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'CRITICAL' | 'SUCCESS';
  message: string;
}

export interface RAGResponse {
  initial_answer: string;
  retrieved_chunks: RetrievedChunk[];
  correction_history: CorrectionStep[];
  final_answer: string;
  has_hallucination: boolean;
  llm_comparison: {
    initial_hallucination_score: number; // 0-100
    final_hallucination_score: number;   // 0-100
  };
  process_log: ProcessLog[];
}

export interface SimulationParams {
  query: string;
  chroma_path: string;
  max_correction_rounds: number;
}