import React, { useState } from "react";
// @ts-ignore
import html2pdf from "html2pdf.js";
import { STAGES, INITIAL_SCRIPTS, PLACEHOLDERS, INITIAL_HISTORY } from "./constants";
import { TeachingStage, ScriptState, ReviewState, ReviewIssue, ScriptHistory, HistoryItem } from "./types";
import { generateScriptForStage, modifyScript, reviewScript } from "./services/geminiService";
import { Spinner } from "./components/Spinner";

const App: React.FC = () => {
  // State
  const [courseFlow, setCourseFlow] = useState("");
  const [experiments, setExperiments] = useState("");
  const [activeTab, setActiveTab] = useState<TeachingStage>(TeachingStage.Import);
  const [scripts, setScripts] = useState<ScriptState>(INITIAL_SCRIPTS);
  const [history, setHistory] = useState<ScriptHistory>(INITIAL_HISTORY);
  const [reviewResults, setReviewResults] = useState<ReviewState>({});
  const [modificationPrompt, setModificationPrompt] = useState("");
  const [newComment, setNewComment] = useState("");
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  
  // Loading States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isModifying, setIsModifying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Helper to add history
  const addToHistory = (stage: TeachingStage, content: string, type: 'generate' | 'modify') => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      content,
      timestamp: Date.now(),
      type
    };
    setHistory(prev => ({
      ...prev,
      [stage]: [newItem, ...prev[stage]].slice(0, 10) // Keep last 10
    }));
  };

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
      
      // Add to history before updating state
      addToHistory(activeTab, generated, 'generate');

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
        addToHistory(activeTab, modified, 'modify');
        setScripts((prev) => ({ ...prev, [activeTab]: modified }));
        setModificationPrompt("");
      }
    } catch (e) {
      alert("修改失败");
    } finally {
      setIsModifying(false);
    }
  };

  const handleRestoreHistory = (item: HistoryItem) => {
    if (window.confirm("确定要恢复此历史版本吗？当前编辑内容将丢失。")) {
      setScripts(prev => ({ ...prev, [activeTab]: item.content }));
      setShowHistoryDropdown(false);
    }
  };

  const handleExportPDF = () => {
    setIsExporting(true);
    // Create a temporary container
    const container = document.createElement('div');
    container.style.padding = '40px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.color = '#333';

    // Header
    const title = document.createElement('h1');
    title.innerText = "飞飞博士人工智能特色课脚本";
    title.style.textAlign = 'center';
    title.style.fontSize = '24px';
    title.style.marginBottom = '20px';
    container.appendChild(title);

    const meta = document.createElement('div');
    meta.innerHTML = `
      <p><strong>课程大纲：</strong> ${courseFlow || '未填写'}</p>
      <p><strong>实验教具：</strong> ${experiments || '无'}</p>
      <hr style="margin: 20px 0; border: 1px solid #eee;" />
    `;
    container.appendChild(meta);

    // Loop through stages
    STAGES.forEach(stage => {
      const scriptContent = scripts[stage];
      if (scriptContent && scriptContent.trim()) {
        const section = document.createElement('div');
        section.style.marginBottom = '30px';
        section.style.pageBreakInside = 'avoid';
        
        const h2 = document.createElement('h2');
        h2.innerText = `【${stage}】`;
        h2.style.fontSize = '18px';
        h2.style.backgroundColor = '#f3f4f6';
        h2.style.padding = '10px';
        h2.style.borderRadius = '8px';
        h2.style.borderLeft = '4px solid #000';
        section.appendChild(h2);

        const contentPre = document.createElement('pre');
        contentPre.innerText = scriptContent;
        contentPre.style.whiteSpace = 'pre-wrap';
        contentPre.style.fontSize = '12px';
        contentPre.style.lineHeight = '1.6';
        contentPre.style.fontFamily = 'monospace';
        contentPre.style.marginTop = '10px';
        section.appendChild(contentPre);

        container.appendChild(section);
      }
    });

    // Options for html2pdf
    const opt = {
      margin:       10,
      filename:     `Script_${new Date().toISOString().slice(0,10)}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Generate
    html2pdf().set(opt).from(container).save().then(() => {
      setIsExporting(false);
    }).catch((err: any) => {
      console.error(err);
      alert("PDF生成失败");
      setIsExporting(false);
    });
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  // Derived state
  const currentReview = reviewResults[activeTab];
  const currentHistory = history[activeTab];

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
        <div className="px-6 pt-6 pb-2 flex justify-between items-center z-20 relative">
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

          <div className="flex items-center gap-3 ml-4 flex-shrink-0">
             {/* History Button */}
            <div className="relative">
              <button
                onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                className={`p-2.5 rounded-full transition-all ${
                  showHistoryDropdown 
                  ? "bg-gray-100 text-black" 
                  : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                }`}
                title="历史版本"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v5h5"/>
                  <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
                </svg>
              </button>

              {/* History Dropdown */}
              {showHistoryDropdown && (
                <div className="absolute right-0 top-12 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50">
                  <div className="px-3 py-2 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-50 flex justify-between">
                    <span>{activeTab} 历史记录</span>
                    <span className="font-normal">{currentHistory.length} versions</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar mt-1">
                    {currentHistory.length === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-400">暂无生成记录</div>
                    ) : (
                      currentHistory.map((item) => (
                        <div 
                          key={item.id} 
                          onClick={() => handleRestoreHistory(item)}
                          className="p-3 hover:bg-gray-50 rounded-xl cursor-pointer group transition-colors"
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                              item.type === 'generate' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                            }`}>
                              {item.type === 'generate' ? 'AI生成' : 'AI修改'}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">{formatTime(item.timestamp)}</span>
                          </div>
                          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                            {item.content.substring(0, 80)}...
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerateCurrent}
              disabled={isGenerating}
              className="flex items-center gap-2 px-6 py-2 bg-black text-white text-xs font-bold rounded-full hover:bg-gray-800 transition-all disabled:opacity-50 shadow-xl shadow-gray-200"
            >
              {isGenerating ? <Spinner className="w-3 h-3 text-white" /> : "生成脚本"}
            </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 relative px-6 py-4 z-10">
            <textarea
                className="w-full h-full p-8 bg-gray-50 rounded-[2rem] text-sm leading-relaxed resize-none focus:outline-none font-mono text-gray-800 custom-scrollbar"
                value={scripts[activeTab]}
                onChange={handleScriptChange}
                placeholder={PLACEHOLDERS[activeTab]}
                spellCheck={false}
                onClick={() => setShowHistoryDropdown(false)} // Close dropdown on edit
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
          <div className="flex gap-2">
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="text-xs font-bold bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-full transition-colors disabled:opacity-30"
              title="导出全部脚本为PDF"
            >
              {isExporting ? <Spinner className="w-3 h-3" /> : "📄 导出"}
            </button>
            <button
              onClick={handleReviewCurrent}
              disabled={isReviewing || !scripts[activeTab]}
              className="text-xs font-bold bg-gray-100 hover:bg-gray-200 text-black px-5 py-2 rounded-full transition-colors disabled:opacity-30"
            >
              {isReviewing ? "审核中..." : "立即审核"}
            </button>
          </div>
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