import { GoogleGenAI, Type } from "@google/genai";
import { RAGResponse, SimulationParams } from "../types";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const simulateRAGProcess = async (params: SimulationParams): Promise<RAGResponse> => {
  const model = "gemini-2.5-flash";

  // We use Gemini to hallucinate the *output* of the RAG system for demonstration purposes.
  // It acts as the backend logic.
  
  const systemPrompt = `
    你是一个专门用于“RAG 幻觉检测与纠正框架”的模拟器。
    
    你的任务是生成一个 JSON 响应，代表该框架处理用户查询时的内部状态。请务必使用中文生成所有内容。
    
    框架流程如下：
    1. 接收查询。
    2. 生成初始回答（可能包含细微的幻觉或错误）。
    3. 从向量数据库检索“块”（根据查询模拟这些内容）。
    4. 检测差异（幻觉）。
    5. 执行纠正轮次。
    6. 输出最终回答。
    
    查询: "${params.query}"
    Chroma 路径: "${params.chroma_path}"
    最大轮次: ${params.max_correction_rounds}
    
    生成逼真的数据。如果查询是技术性的（例如关于 AI 模型），请使用真实的知识来模拟块。
    确保“initial_answer”有一些缺陷，以便演示纠正过程；如果查询很简单，则可以使其正确。
    对于“llm_comparison”，给出一个 0 到 100 的分数，代表幻觉存在的程度。
    “process_log”中的消息必须是中文。
  `;

  const response = await ai.models.generateContent({
    model: model,
    contents: systemPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          initial_answer: { type: Type.STRING, description: "LLM 的初稿回答，可能包含错误。请使用中文。" },
          retrieved_chunks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                source: { type: Type.STRING },
                content: { type: Type.STRING, description: "检索到的文本块内容。请使用中文。" },
                relevance_score: { type: Type.NUMBER },
              }
            }
          },
          correction_history: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                round: { type: Type.INTEGER },
                reasoning: { type: Type.STRING, description: "纠正理由。请使用中文。" },
                modified_part: { type: Type.STRING, description: "修改的部分。请使用中文。" },
              }
            }
          },
          final_answer: { type: Type.STRING, description: "经过纠正的、事实准确的回答。请使用中文。" },
          has_hallucination: { type: Type.BOOLEAN },
          llm_comparison: {
            type: Type.OBJECT,
            properties: {
              initial_hallucination_score: { type: Type.NUMBER },
              final_hallucination_score: { type: Type.NUMBER },
            }
          },
          process_log: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timestamp: { type: Type.STRING },
                level: { type: Type.STRING, enum: ["INFO", "WARN", "CRITICAL", "SUCCESS"] },
                message: { type: Type.STRING, description: "日志消息。请使用中文。" },
              }
            }
          }
        },
        required: ["initial_answer", "retrieved_chunks", "correction_history", "final_answer", "has_hallucination", "llm_comparison", "process_log"]
      }
    }
  });

  if (response.text) {
    return JSON.parse(response.text) as RAGResponse;
  }
  
  throw new Error("Failed to generate simulation data");
};