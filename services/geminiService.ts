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
  
  // Specific constraints based on stage to ensure total segments < 20 globally
  let stageConstraint = "";
  if (stage === TeachingStage.Import) {
    stageConstraint = `
    【情景导入环节特殊节奏（严格遵守）】：
    本环节严格限制时长不超过2分钟。建议生成3个分镜（编号）。
    1. **[编号01]、[编号02]**：
       - **内容**：展示多多的困惑、遭遇困难，或单纯的情景铺垫。
       - **角色**：只能出现“多多”或“旁白/画外音”。**多多只负责提问，不自己解答。**
       - **禁忌**：**严禁**“飞飞博士”在此处出场。
    2. **[编号03]**：
       - **内容**：飞飞博士正式登场，回应多多的问题，引出课题。
       - **角色**：必须出现“飞飞博士”。
       - **格式**：使用\`飞飞博士（中）\`表示飞飞博士位于画面正中间位置。
    `;
  } else if (stage === TeachingStage.Explore) {
    stageConstraint = "本环节时长约10-15分钟。建议生成4-6个分镜（编号）。飞飞博士带领学生解决问题。注意与上一环节的自然衔接。";
  } else if (stage === TeachingStage.Practice) {
    stageConstraint = `
    【动手实践环节特殊要求（强制包含）】：
    1. **安全提示（必须包含且置于本环节最开始）**：
       在本环节的第一个分镜（通常是[编号xx]），必须**逐字**使用以下文案作为内容（飞飞博士或画外音口播），不要随意修改：
       """
       开始动手实践之前，我们一起看下安全小贴士。
       1.双手操作要小心。制作过程中这些材料仅用于观察和操作，绝对不能放入口中，也要避免材料边缘划伤自己。
       2.材料摆放要整齐。制作材料每人只有一套，妥善保管好，不要弄丢。
       3.工具使用要规范，按照老师要求正确使用工具。
       4.遇到问题要举手。制作过程中如果有疑问或困难，可以举手请老师帮忙。
       最后，制作结束后，我们要保持桌面的整洁，不乱丢废弃物。记住了吗？
       """
       类型建议使用：转场【视频】或 转场【图片】。

    2. **搭建步骤**：
       安全提示之后，接续“搭建【操作视频】”类型的分镜，描述具体的搭建步骤（不超过10步）。
    `;
  } else if (stage === TeachingStage.Expand) {
    stageConstraint = "本环节时长约3分钟。建议生成2-3个分镜（编号）。支持生成“交互题”。注意承接上一环节的实践成果。";
  } else if (stage === TeachingStage.Share) {
    stageConstraint = `
    【分享展示环节特殊要求】：
    1. 内容包含：邀请分享、回顾知识、手册答题（3道题）、学生自评。
    2. **强制台词要求**：
       在引导学生进行手册记录时，必须包含一句台词（飞飞博士说）：
       “请大家翻开学生手册，认真完成（此处填具体内容），并填写AI芯片卡背后的AI词汇。”
    `;
  } else if (stage === TeachingStage.Lab) {
    stageConstraint = `
    【家庭AI-Lab环节特殊要求】：
    1. 布置家庭任务。
    2. **强制新增提醒**：必须有一句台词提醒学生“回家后把AI芯片卡插入到能量集卡册中”。
    `;
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
    
    【课程标准与配置规范（必须严格参考）】：
    ${STANDARD_TEXT}
    
    【课程流（大纲）】：
    ${courseFlow}
    
    【实验/教具信息（可选）】：
    ${experiments || "无特定教具，请根据大纲自行设计"}

    ${previousContext ? `【前序环节内容（请保持剧情和逻辑连贯）】：\n${previousContext}` : ""}
    
    【角色设定（严格遵守）】：
    1. **多多**：
       - **只负责提问**、表达疑惑。
       - **严禁**多多自己解答问题。
       - 仅限在“情境导入”环节出场。
    2. **飞飞博士**：
       - **负责解答**、引导实验、总结知识。
       - 在“情境导入”的编号03开始出场。

    【格式与类型要求（非常重要）】：
    1. **类型字段**：必须严格从以下列表中选择，**严禁使用列表之外的词汇**：
       - 转场【图片】
       - 转场【视频】
       - 动画【视频】
       - 交互题
       - 工具
       - 搭建【操作视频】
    2. **内容格式 - 逐字稿（Verbatim Transcript）**：
       - **内容**必须是角色的**逐字口语稿**。
       - **格式**：\`角色名（位置/状态）：台词内容\`。
       - **精简标签规则**：**在同一个[编号]内，角色名标签（如\`飞飞博士（中）：\`）只在第一段出现一次。** 如果该角色连续说话，后续段落直接写台词，不要重复写标签。
       - **严禁**：剧本式画面描述（如“画面切到...”）。
    3. **过渡衔接**：
       - 生成的内容必须与【前序环节内容】自然衔接，使用过渡语句承上启下。
    
    【其他要求】：
    1. **纯文本格式**：严禁使用Markdown。直接输出文字。
    2. **数量控制**：全课程总环节数不能超过20个。
       - **当前环节约束**：${stageConstraint}
    3. **内容风格**：口语化、生动有趣，符合对应年龄段认知。
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
  const allStages = Object.values(TeachingStage).join("、");

  const prompt = `
    你是一个课程脚本助手。用户正在编辑“${stage}”环节的脚本。
    
    【所有课程环节】：${allStages}
    【当前环节】：${stage}
    【配置类型白名单】：转场【图片】、转场【视频】、动画【视频】、交互题、工具、搭建【操作视频】。
    
    【当前脚本内容】：
    ${currentScript}

    【用户修改指令】：
    ${instruction}

    【约束条件】：
    1. **角色约束**：
       - 多多只提问，不解答。
       - 飞飞博士解答问题。
    2. **内容约束**：
       - 如果是“动手实践”环节，**必须保留**原有的安全小贴士（如果存在）。
       - 如果是“分享展示”环节，**必须保留**关于“填写AI芯片卡背后的AI词汇”的引导。
    3. **格式约束**：
       - 必须是**逐字稿**。格式：\`角色名（状态）：台词\`。
       - **标签规则**：同一个编号内，角色标签只出现一次（第一段）。
    
    【逻辑判断与执行】：
    1. **意图识别**：若用户想修改其他环节（非“${stage}”），输出 "ERROR_WRONG_STAGE"。
    2. **执行修改**：否则，输出修改后的**完整脚本**（纯文本）。
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
    1. **格式检查**：
       - 类型是否在白名单内？
       - 内容是否为**逐字稿**？(如：\`飞飞博士（中）：...\`)
    2. **特定环节内容检查**：
       - **情境导入**：编号01-02无飞飞博士；编号03飞飞博士必须出场；多多只提问不解答。
       - **动手实践**：**必须包含**“安全小贴士”的逐字稿（双手操作要小心...）。如果不包含或内容被篡改，必须报错。
       - **分享展示**：**必须包含**“请大家翻开学生手册……并填写AI芯片卡背后的AI词汇”相关句式。
       - **家庭AI-Lab**：**必须包含**“把AI芯片卡插入到能量集卡册中”相关内容。
    3. **角色检查**：
       - 非导入环节严禁出现“多多”。
    
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
