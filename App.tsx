import React, { useState } from "react";
import { STAGES, INITIAL_SCRIPTS, PLACEHOLDERS } from "./constants";
import { TeachingStage, ScriptState, ReviewState, ReviewIssue } from "./types";
import { generateScriptForStage, modifyScript, reviewScript } from "./services/geminiService";
import { Spinner } from "./components/Spinner";

const App: React.FC = () => {
  // State
  const [courseFlow, setCourseFlow] = useState("");
  const [experiments, setExperiments] = useState("");
  const [activeTab, setActiveTab] = useState<TeachingStage>(TeachingStage.Import);
  const [scripts, setScripts] = useState<ScriptState>(INITIAL_SCRIPTS);
  const [reviewResults, setReviewResults] = useState<ReviewState>({});
  const [modificationPrompt, setModificationPrompt] = useState("");
  const [newComment, setNewComment] = useState("");
  
  // Loading States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isModifying, setIsModifying] = useState(false);

  // Handlers
  const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setScripts((prev) => ({ ...prev, [activeTab]: e.target.value }));
  };

  const handleGenerateCurrent = async () => {
    if (!courseFlow) {
      alert("请填写课程大纲 (Course Flow)");
      return;
    }
    setIsGenerating(true);
    try {
      // Pass the current scripts state to include previous stages context
      const generated = await generateScriptForStage(activeTab, courseFlow, experiments, scripts);
      setScripts((prev) => ({ ...prev, [activeTab]: generated }));
      // Preserve manual comments
      const currentManuals = reviewResults[activeTab]?.issues.filter(i => i.isManual) || [];
      setReviewResults(prev => ({...prev, [activeTab]: { issues: currentManuals }}));
    } catch (e) {
      alert("生成失败，请检查API Key或网络连接");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReviewCurrent = async () => {
    const script = scripts[activeTab];
    if (!script || script.trim().length < 5) {
      alert("脚本内容过少");
      return;
    }
    setIsReviewing(true);
    try {
      const result = await reviewScript(script, activeTab);
      const manualIssues = reviewResults[activeTab]?.issues.filter(i => i.isManual) || [];
      
      setReviewResults((prev) => ({ 
        ...prev, 
        [activeTab]: { 
          issues: [...manualIssues, ...result.issues] 
        } 
      }));
    } catch (e) {
      alert("审核失败");
    } finally {
      setIsReviewing(false);
    }
  };

  const handleAddManualComment = () => {
    if (!newComment.trim()) return;
    const issue: ReviewIssue = {
      id: Date.now().toString(),
      comment: newComment,
      severity: 'medium',
      isManual: true
    };
    
    setReviewResults(prev => {
      const current = prev[activeTab] || { issues: [] };
      return {
        ...prev,
        [activeTab]: {
          issues: [issue, ...current.issues]
        }
      };
    });
    setNewComment("");
  };

  const handleModification = async () => {
    if (!modificationPrompt.trim()) return;
    const script = scripts[activeTab];
    if (!script) return;
    
    setIsModifying(true);
    try {
      const modified = await modifyScript(script, modificationPrompt, activeTab);
      
      if (modified.includes("ERROR_WRONG_STAGE")) {
        alert(`❌ 错误：您的修改指令似乎指向了其他环节。\n\n当前正在编辑【${activeTab}】。\n如需修改其他环节，请先点击顶部标签页切换到对应页面。`);
      } else {
        setScripts((prev) => ({ ...prev, [activeTab]: modified }));
        setModificationPrompt("");
      }
    } catch (e) {
      alert("修改失败");
    } finally {
      setIsModifying(false);
    }
  };

  // Derived state
  const currentReview = reviewResults[activeTab];

  return (
    <div className="flex h-screen bg-white text-gray-900 font-sans overflow-hidden">
      {/* --- Left Column: Context Inputs --- */}
      <div className="w-1/4 min-w-[320px] flex flex-col border-r border-gray-100 bg-white">
        <div className="p-8 pb-4">
          <h1 className="text-xl font-bold tracking-tight text-black">课程脚本生成</h1>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">AI Course Script Generator</p>
        </div>
        
        <div className="flex-1 flex flex-col px-8 pb-8 gap-6 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col flex-1">
            <label className="text-xs font-bold uppercase text-gray-500 mb-3 tracking-wide">课程大纲 Course Flow <span className="text-red-500">*</span></label>
            <textarea
              className="flex-1 w-full p-6 bg-gray-50 rounded-3xl focus:ring-2 focus:ring-black/5 outline-none text-sm resize-none transition-all placeholder-gray-400"
              placeholder="输入本节课的教学大纲流程..."
              value={courseFlow}
              onChange={(e) => setCourseFlow(e.target.value)}
            />
          </div>
          
          <div className="flex flex-col flex-1">
            <label className="text-xs font-bold uppercase text-gray-500 mb-3 tracking-wide">实验教具 Experiments <span className="text-gray-300 font-normal">(选填)</span></label>
            <textarea
              className="flex-1 w-full p-6 bg-gray-50 rounded-3xl focus:ring-2 focus:ring-black/5 outline-none text-sm resize-none transition-all placeholder-gray-400"
              placeholder="输入本节课用到的教具、实验材料（可选）..."
              value={experiments}
              onChange={(e) => setExperiments(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* --- Middle Column: Tabs & Editor --- */}
      <div className="w-1/2 flex flex-col relative bg-white border-r border-gray-100">
        {/* Header: Tabs + Generate Button */}
        <div className="px-6 pt-6 pb-2 flex justify-between items-center">
          {/* Tabs - Pill Style */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {STAGES.map((stage) => (
              <button
                key={stage}
                onClick={() => setActiveTab(stage)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === stage
                    ? "bg-black text-white shadow-md"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {stage}
              </button>
            ))}
          </div>

          {/* Action Button */}
          <button
            onClick={handleGenerateCurrent}
            disabled={isGenerating}
            className="flex items-center gap-2 px-6 py-2 bg-black text-white text-xs font-bold rounded-full hover:bg-gray-800 transition-all disabled:opacity-50 shadow-xl shadow-gray-200 ml-4 flex-shrink-0"
          >
            {isGenerating ? <Spinner className="w-3 h-3 text-white" /> : "生成脚本"}
          </button>
        </div>

        {/* Editor Area */}
        <div className="flex-1 relative px-6 py-4">
            <textarea
                className="w-full h-full p-8 bg-gray-50 rounded-[2rem] text-sm leading-relaxed resize-none focus:outline-none font-mono text-gray-800 custom-scrollbar"
                value={scripts[activeTab]}
                onChange={handleScriptChange}
                placeholder={PLACEHOLDERS[activeTab]}
                spellCheck={false}
            />
        </div>

        {/* Bottom Bar: AI Modification */}
        <div className="px-6 pb-6 pt-2 bg-white">
          <div className="relative shadow-sm rounded-full">
            <input
              type="text"
              className="w-full bg-gray-50 rounded-full pl-6 pr-32 py-4 text-sm focus:ring-0 outline-none transition-all placeholder-gray-400 font-medium"
              placeholder="输入指令调整内容..."
              value={modificationPrompt}
              onChange={(e) => setModificationPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isModifying && handleModification()}
            />
            <button
              onClick={handleModification}
              disabled={isModifying || !scripts[activeTab]}
              className="absolute right-2 top-2 bottom-2 bg-black text-white px-6 rounded-full text-xs font-bold transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {isModifying && <Spinner className="w-3 h-3 text-white" />}
              修改
            </button>
          </div>
        </div>
      </div>

      {/* --- Right Column: Review & Audit --- */}
      <div className="w-1/4 min-w-[280px] flex flex-col bg-white">
        <div className="p-8 pb-4 flex justify-between items-center">
          <h2 className="font-bold text-lg text-black">标准审核</h2>
          <button
            onClick={handleReviewCurrent}
            disabled={isReviewing || !scripts[activeTab]}
            className="text-xs font-bold bg-gray-100 hover:bg-gray-200 text-black px-5 py-2 rounded-full transition-colors disabled:opacity-30"
          >
            {isReviewing ? "审核中..." : "立即审核"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
          {/* Manual Comment Input */}
          <div className="mb-8">
            <label className="text-xs font-bold uppercase text-gray-400 mb-2 block tracking-wide">添加备注 Add Note</label>
            <div className="relative group">
              <textarea 
                className="w-full p-4 bg-gray-50 rounded-3xl text-xs focus:ring-2 focus:ring-black/5 outline-none resize-none transition-colors"
                rows={3}
                placeholder="记录人工审核意见..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && handleAddManualComment()}
              />
              <button 
                onClick={handleAddManualComment}
                disabled={!newComment.trim()}
                className="absolute bottom-3 right-3 text-[10px] bg-black text-white px-3 py-1 rounded-full hover:bg-gray-800 disabled:opacity-0 transition-opacity"
              >
                添加
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {(!currentReview || currentReview.issues.length === 0) ? (
              <div className="text-center py-10 opacity-30">
                <span className="block text-4xl mb-2">🛡️</span>
                <span className="text-xs">暂无问题</span>
              </div>
            ) : (
              currentReview.issues.map((issue, idx) => (
                <div key={issue.id || idx} className={`p-5 rounded-3xl transition-all hover:shadow-sm ${
                  issue.isManual 
                    ? 'bg-gray-50' 
                    : issue.severity === 'high' 
                      ? 'bg-white ring-1 ring-black/10 shadow-lg shadow-red-500/5' 
                      : 'bg-white ring-1 ring-gray-100'
                }`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      issue.isManual 
                        ? 'bg-gray-200 text-gray-600' 
                        : issue.severity === 'high'
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-gray-800'
                    }`}>
                      {issue.isManual ? '人工备注' : issue.severity === 'high' ? '严重问题' : '优化建议'}
                    </span>
                  </div>
                  
                  <p className="text-sm font-medium text-gray-900 leading-snug mb-2">{issue.comment}</p>
                  
                  {issue.quote && (
                    <div className="pl-3 border-l-2 border-gray-300 text-xs text-gray-500 italic mb-2 font-mono">
                      "{issue.quote}"
                    </div>
                  )}

                  {issue.suggestion && (
                    <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl mt-3">
                      <span className="font-bold text-black mr-1">建议:</span> 
                      {issue.suggestion}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
