import { GoogleGenAI, Type } from "@google/genai";
import { STANDARD_TEXT, STAGES } from "../constants";
import { ReviewResult, TeachingStage, ScriptState } from "../types";

let aiClient: GoogleGenAI | null = null;

const getAiClient = () => {
  if (!aiClient) {
    if (!process.env.API_KEY) {
      throw new Error("API_KEY is missing in environment variables");
    }
    aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return aiClient;
};

const TEXT_MODEL = "gemini-3-flash-preview";

export const generateScriptForStage = async (
  stage: TeachingStage,
  courseFlow: string,
  experiments: string,
  existingScripts: ScriptState
): Promise<string> => {
  const ai = getAiClient();
  
  // Specific constraints based on stage to ensure total segments < 25 globally
  let stageConstraint = "";
  if (stage === TeachingStage.Import) {
    stageConstraint = "本环节严格限制时长不超过2分钟。建议生成2-3个分镜（编号）。";
  } else if (stage === TeachingStage.Explore) {
    stageConstraint = "本环节时长约10-15分钟。建议生成6-8个分镜（编号）。";
  } else if (stage === TeachingStage.Practice) {
    stageConstraint = "本环节时长约10-15分钟。建议生成5-7个分镜（编号）。";
  } else if (stage === TeachingStage.Expand) {
    stageConstraint = "本环节时长约3分钟。建议生成2-3个分镜（编号）。";
  } else if (stage === TeachingStage.Share) {
    stageConstraint = "本环节时长约5分钟。建议生成2-4个分镜（编号）。";
  } else if (stage === TeachingStage.Lab) {
    stageConstraint = "本环节时长约1分钟。建议生成1个分镜（编号）。";
  }

  // Build context from previous stages
  const stageIndex = STAGES.indexOf(stage);
  let previousContext = "";
  if (stageIndex > 0) {
    const previousStages = STAGES.slice(0, stageIndex);
    previousContext = previousStages.map(s => {
      const content = existingScripts[s];
      return content && content.trim().length > 0 ? `【${s}环节已生成内容】：\n${content}` : null;
    }).filter(Boolean).join("\n\n");
  }

  const prompt = `
    你是一位专业的少儿人工智能课程设计师。
    请根据以下《飞飞博士人工智能特色课课程标准》和用户提供的课程信息，生成“${stage}”环节的课程脚本。
    
    【课程标准与优秀案例（必须严格参考）】：
    ${STANDARD_TEXT}
    
    【课程流（大纲）】：
    ${courseFlow}
    
    【实验/教具信息（可选）】：
    ${experiments || "无特定教具，请根据大纲自行设计"}

    ${previousContext ? `【前序环节内容（请保持剧情和逻辑连贯）】：\n${previousContext}` : ""}
    
    【核心输出要求】：
    1. **纯文本格式**：严禁使用Markdown。直接输出文字。
    2. **学习优秀案例**：请仔细阅读标准文档中的“优秀脚本案例”，严格模仿其格式、语调、画面描述方式。
    3. **结构规范**：换行区分：[编号]、配置类型、时长、内容。
       - 必须包含详细的【画面描述】、【旁白】、【画面文字】等标记。
    4. **环节连贯性**：必须承接“前序环节内容”的剧情和逻辑，确保6个环节（导入-探究-实践-拓展-分享-Lab）构成完整一课。
    5. **数量控制**：全课程总环节数不能超过25个。
       - **当前环节约束**：${stageConstraint}
    6. **内容风格**：口语化、生动有趣，符合对应年龄段认知。
    7. 不要输出任何开场白或结束语。
  `;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 1024 }
      }
    });
    return response.text || "生成失败";
  } catch (error) {
    console.error("Error generating script:", error);
    throw error;
  }
};

export const modifyScript = async (
  currentScript: string,
  instruction: string,
  stage: TeachingStage
): Promise<string> => {
  const ai = getAiClient();
  
  // Get all stage names to help the model identify other stages
  const allStages = Object.values(TeachingStage).join("、");

  const prompt = `
    你是一个课程脚本助手。用户正在编辑“${stage}”环节的脚本。
    
    【所有课程环节】：${allStages}
    
    【当前环节】：${stage}
    
    【当前脚本内容】：
    ${currentScript}

    【用户修改指令】：
    ${instruction}

    【逻辑判断与执行】：
    1. **意图识别**：请判断用户的指令是否明确想要修改**其他环节**（非“${stage}”）的内容？
       - 例如：当前是“自主探究”，用户说“把导入环节的时间改一下” -> 属于修改其他环节。
       - 例如：当前是“自主探究”，用户说“把第一个视频改短一点” -> 属于修改当前环节（假设当前环节有视频）。
    2. **如果属于修改其他环节**：请直接输出字符串 "ERROR_WRONG_STAGE"。不要输出任何其他内容。
    3. **如果属于修改当前环节**：请执行修改，并输出修改后的**完整脚本**。
       - 保持纯文本格式，严禁Markdown。
       - 保持 [编号] - 类型 - 时长 - 内容 的结构。
       - 严格遵守课程标准。
  `;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
    });
    return response.text || "修改失败";
  } catch (error) {
    console.error("Error modifying script:", error);
    throw error;
  }
};

export const reviewScript = async (
  script: string,
  stage: TeachingStage
): Promise<ReviewResult> => {
  const ai = getAiClient();

  const prompt = `
    请严格按照《飞飞博士人工智能特色课课程标准》审核以下“${stage}”环节的脚本。
    
    【脚本】：
    ${script}
    
    【完整课程标准】：
    ${STANDARD_TEXT}
    
    【审核重点】：
    1. **时长限制**：情景导入环节绝对不能超过2分钟。
    2. **敏感红线**：政治、宗教、暴力、歧视等禁忌话题。
    3. **语言适龄**：是否符合学生年龄认知（检查术语是否过难）。
    4. **结构规范**：是否符合6T教学法环节要求。
    5. **逻辑连贯**：问题是否闭环，知识是否有来源。

    **不需要评分**。只列出发现的具体问题。
    
    请以JSON格式返回，格式如下：
    {
      "issues": [
        {
          "quote": "原文片段（可选）",
          "comment": "问题描述",
          "severity": "high" | "medium" | "low",
          "suggestion": "修改建议（可选）"
        }
      ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            issues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  quote: { type: Type.STRING },
                  comment: { type: Type.STRING },
                  severity: { type: Type.STRING, enum: ["high", "medium", "low"] },
                  suggestion: { type: Type.STRING },
                },
                required: ["comment", "severity"],
              },
            },
          },
          required: ["issues"],
        },
      },
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");
    return JSON.parse(jsonText) as ReviewResult;
  } catch (error) {
    console.error("Error reviewing script:", error);
    return { issues: [] };
  }
};
