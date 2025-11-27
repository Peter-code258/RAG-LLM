import React, { useState, useEffect, useRef } from 'react';
import BootSequence from './components/BootSequence';
import RetroInput from './components/RetroInput';
import { simulateRAGProcess } from './services/geminiService';
import { RAGResponse, SimulationParams } from './types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
  RadialBarChart, RadialBar, AreaChart, Area, CartesianGrid, Brush, ReferenceLine
} from 'recharts';

const DEFAULT_QUERY = "BAAI/bge模型的向量维度是多少？";

// Utility for hover effect classes
const cardHoverClass = "transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_0_15px_rgba(255,176,0,0.3)] hover:border-amber-400 hover:bg-black/80 backdrop-blur-sm";

// --- Internal Component: Animated Counter ---
const AnimatedCounter = ({ value, duration = 1500 }: { value: number, duration?: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // EaseOutQuart function
      const ease = 1 - Math.pow(1 - progress, 4); 
      setCount(Math.floor(ease * value));
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [value, duration]);

  return <span>{count}</span>;
};

// --- Internal Component: Custom Tooltip ---
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-black border border-[#ffb000] p-2 text-xs font-mono shadow-[0_0_10px_rgba(255,176,0,0.2)] z-50">
        <p className="text-[#ffb000] font-bold mb-1 border-b border-[#ffb000]/30 pb-1">{`节点: ${label}`}</p>
        <p className="text-white">{`幻觉评分: ${payload[0].value}%`}</p>
        <div className="mt-1 text-[10px] text-gray-400">
           {label === '初始' ? 'LLM 原始生成' : 
            label === '最终' ? '最终一致性检查' : 
            'RAG 纠正迭代中...'}
        </div>
      </div>
    );
  }
  return null;
};

const App: React.FC = () => {
  const [booted, setBooted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [params, setParams] = useState<SimulationParams>({
    query: DEFAULT_QUERY,
    chroma_path: "./data/chroma_db/",
    max_correction_rounds: 2
  });
  const [result, setResult] = useState<RAGResponse | null>(null);
  
  // State for interactivity
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());
  const [minRelevance, setMinRelevance] = useState(0);
  const [showDebug, setShowDebug] = useState(true);
  const [viewMode, setViewMode] = useState<'text' | 'dashboard'>('text');
  const [showTrendDetail, setShowTrendDetail] = useState(false);

  // History Sidebar State
  const [showHistory, setShowHistory] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);

  // Audio Context Refs & State
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const sequencerIntervalRef = useRef<number | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [volume, setVolume] = useState(30); // Default volume

  const playNote = (ctx: AudioContext, freq: number, time: number, duration: number, vol: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, time);
    filter.frequency.exponentialRampToValueAtTime(100, time + duration); // Filter sweep

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainRef.current!);

    osc.start(time);
    osc.stop(time + duration);
  };

  const initAudio = () => {
    if (audioContextRef.current) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.value = volume / 100;
    masterGain.connect(ctx.destination);
    masterGainRef.current = masterGain;

    // --- DRONE LAYER (Atmosphere) ---
    const droneOsc = ctx.createOscillator();
    const droneGain = ctx.createGain();
    droneOsc.type = 'triangle';
    droneOsc.frequency.value = 55; // Low A
    droneGain.gain.value = 0.1;
    droneOsc.connect(droneGain);
    droneGain.connect(masterGain);
    droneOsc.start();

    // --- SEQUENCER LAYER (Melody) ---
    let noteIndex = 0;
    // Simple Synthwave pattern (A minor)
    // A2, C3, E3, A3 ...
    const notes = [
      110.00, 130.81, 164.81, 220.00, 
      110.00, 130.81, 164.81, 196.00, // G3
      87.31,  130.81, 174.61, 220.00, // F major ish
      87.31,  130.81, 174.61, 196.00
    ];

    const tempo = 120;
    const stepTime = 60 / tempo / 2; // 8th notes
    
    // We schedule ahead
    let nextNoteTime = ctx.currentTime;

    const scheduler = () => {
      while (nextNoteTime < ctx.currentTime + 0.1) {
        // Play note
        const freq = notes[noteIndex % notes.length];
        // Randomize velocity slightly
        const vel = 0.1 + Math.random() * 0.05;
        playNote(ctx, freq, nextNoteTime, 0.3, vel);
        
        // Bass punch on beat 1
        if (noteIndex % 4 === 0) {
           playNote(ctx, freq / 2, nextNoteTime, 0.4, 0.2);
        }

        nextNoteTime += stepTime;
        noteIndex++;
      }
    };

    const intervalId = window.setInterval(scheduler, 25);
    sequencerIntervalRef.current = intervalId;

    setIsAudioPlaying(true);
  };

  const toggleAudio = () => {
    if (!audioContextRef.current) return;

    if (audioContextRef.current.state === 'running') {
      audioContextRef.current.suspend();
      setIsAudioPlaying(false);
    } else if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
      setIsAudioPlaying(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseInt(e.target.value);
    setVolume(newVol);
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = newVol / 100;
    }
  };

  const handleSystemStart = () => {
    initAudio();
    setBooted(true);
  };

  const handleReset = () => {
    setResult(null);
    setExpandedChunks(new Set());
    setIsLoading(false);
    setViewMode('text');
    setShowTrendDetail(false);
  };

  const runSimulation = async (simulationParams: SimulationParams) => {
    setIsLoading(true);
    setResult(null);
    setExpandedChunks(new Set()); 
    setViewMode('text');
    
    // Update History
    if (simulationParams.query.trim()) {
      setQueryHistory(prev => {
        // Remove duplicates and move to top
        const filtered = prev.filter(q => q !== simulationParams.query);
        return [simulationParams.query, ...filtered].slice(0, 20); // Keep last 20
      });
    }

    try {
      const data = await simulateRAGProcess(simulationParams);
      setResult(data);
    } catch (error) {
      console.error(error);
      alert("系统错误: 神经链接失败。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStart = () => {
    runSimulation(params);
  };

  const handleHistorySelect = (historyQuery: string) => {
    const newParams = { ...params, query: historyQuery };
    setParams(newParams);
    setShowHistory(false);
    runSimulation(newParams);
  };

  const toggleChunk = (id: string) => {
    const newSet = new Set(expandedChunks);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedChunks(newSet);
  };

  if (!booted) {
    return (
      <div className="retro-grid min-h-screen">
        <div className="scanlines"></div>
        <div className="vignette"></div>
        <BootSequence onComplete={handleSystemStart} />
      </div>
    );
  }

  // Filter logic
  const chunks = result?.retrieved_chunks || [];
  const filteredChunks = chunks.filter(chunk => (chunk.relevance_score * 100) >= minRelevance);

  // Prepare Chart Data
  const radarData = result ? [
    { subject: '事实准确性', A: 100 - result.llm_comparison.initial_hallucination_score, B: 100 - result.llm_comparison.final_hallucination_score, fullMark: 100 },
    { subject: '低幻觉率', A: 100 - result.llm_comparison.initial_hallucination_score, B: 100 - result.llm_comparison.final_hallucination_score, fullMark: 100 },
    { subject: '逻辑连贯性', A: 60, B: 95, fullMark: 100 }, // Mocked for visual
    { subject: '上下文相关', A: 70, B: 90, fullMark: 100 }, // Mocked
    { subject: '安全合规', A: 85, B: 98, fullMark: 100 }, // Mocked
  ] : [];

  const radialData = result ? [
    { name: '最终得分', value: 100 - result.llm_comparison.final_hallucination_score, fill: '#22c55e' }
  ] : [];

  // Generate Trend Data for the Line Chart inside Final Answer
  const generateTrendData = () => {
    if (!result) return [];
    const start = result.llm_comparison.initial_hallucination_score;
    const end = result.llm_comparison.final_hallucination_score;
    const rounds = result.correction_history.length;
    
    const data = [{ name: '初始', score: start }];
    
    if (rounds > 0) {
        for(let i=1; i<=rounds; i++) {
            // Simple interpolation for demo purposes
            const score = Math.round(start - ((start - end) * (i / rounds)));
            data.push({ name: `R${i}`, score: score });
        }
    } else {
        // If no correction rounds, add final same as start
        data.push({ name: '最终', score: end });
    }
    // Ensure final point exists if logic above missed it or rounds were 0
    if (data[data.length - 1].name !== '最终' && rounds > 0) {
       data.push({ name: '最终', score: end });
    }
    return data;
  };

  const trendData = generateTrendData();

  return (
    <div className="min-h-screen w-full bg-[#110e05] text-[#ffb000] font-mono p-4 md:p-6 lg:p-8 flex flex-col relative overflow-hidden retro-grid">
      {/* Visual Overlays */}
      <div className="scanlines"></div>
      <div className="vignette"></div>

      {/* HISTORY SIDEBAR */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
      )}
      <div className={`fixed top-0 left-0 h-full w-80 bg-[#110e05] border-r-2 border-[#ffb000] z-50 transform transition-transform duration-300 ease-in-out ${showHistory ? 'translate-x-0' : '-translate-x-full'} shadow-[0_0_50px_rgba(255,176,0,0.2)] flex flex-col`}>
        <div className="p-4 border-b border-[#ffb000] flex justify-between items-center bg-[#ffb000]/10">
          <h2 className="text-xl font-bold uppercase tracking-wider text-glow">查询历史库</h2>
          <button onClick={() => setShowHistory(false)} className="text-[#ffb000] hover:text-white">[X]</button>
        </div>
        <div className="flex-grow overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {queryHistory.length === 0 ? (
            <div className="text-center opacity-40 mt-10 italic">-- 暂无归档数据 --</div>
          ) : (
            queryHistory.map((query, idx) => (
              <div 
                key={idx}
                onClick={() => handleHistorySelect(query)}
                className="border border-[#ffb000]/30 p-3 hover:bg-[#ffb000]/20 cursor-pointer transition-all hover:border-[#ffb000] group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-[#ffb000] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="text-xs text-[#ffb000]/60 mb-1 font-bold">RECORD_ID: {1000 + idx}</div>
                <div className="text-sm line-clamp-2 leading-tight">{query}</div>
                <div className="mt-2 text-[10px] text-right opacity-0 group-hover:opacity-100 uppercase tracking-widest text-green-400">>> 重新加载</div>
              </div>
            ))
          )}
        </div>
        <div className="p-2 border-t border-[#ffb000]/30 text-center text-[10px] opacity-40 uppercase">
          Memory Bank Usage: {queryHistory.length} / 20
        </div>
      </div>

      {/* HEADER */}
      <header className="border-b-4 border-[#ffb000] pb-4 mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 relative z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowHistory(true)}
            className="flex flex-col items-center justify-center p-2 border border-[#ffb000] bg-black hover:bg-[#ffb000] hover:text-black transition-all group"
          >
             <div className="w-6 h-0.5 bg-current mb-1 group-hover:w-6 transition-all"></div>
             <div className="w-6 h-0.5 bg-current mb-1 group-hover:w-4 transition-all"></div>
             <div className="w-6 h-0.5 bg-current group-hover:w-2 transition-all"></div>
             <span className="text-[8px] mt-1 font-bold uppercase">History</span>
          </button>
          <div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold uppercase tracking-tighter text-glow glitch" data-text="RAG-HC 框架">RAG-HC 框架</h1>
            <p className="text-sm md:text-xl opacity-80 mt-1">幻觉检测与纠正模块 <span className="text-xs border border-[#ffb000] px-1 ml-2 rounded">V2.1 BUILD 2077</span></p>
          </div>
        </div>
        
        <div className="flex flex-row-reverse md:flex-col items-end gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* System Status */}
          <div className="text-right hidden md:block">
            <div className="text-xs uppercase">系统状态</div>
            <div className="text-xl font-bold text-green-500 animate-pulse">在线</div>
          </div>
          
          {/* Audio Controls */}
          <div className="flex items-center gap-3 bg-[#ffb000]/10 border border-[#ffb000]/30 p-1.5 rounded backdrop-blur-sm self-end">
            <button 
              onClick={toggleAudio}
              className={`text-[10px] uppercase font-bold px-2 py-1 border transition-colors min-w-[60px] ${
                isAudioPlaying 
                  ? 'border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000] hover:text-black' 
                  : 'border-gray-600 text-gray-500 hover:border-[#ffb000] hover:text-[#ffb000]'
              }`}
            >
              {isAudioPlaying ? "音乐: 开" : "音乐: 关"}
            </button>
            <div className="flex items-center gap-2 border-l border-[#ffb000]/20 pl-2">
              <span className="text-[10px] uppercase opacity-70">音量</span>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={volume}
                onChange={handleVolumeChange}
                className="w-16 accent-[#ffb000] h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 flex-grow relative z-10">
        
        {/* LEFT COLUMN: CONTROLS (Moved to Order 1 on mobile/desktop as requested) */}
        <div className="lg:col-span-4 flex flex-col gap-6 order-1 lg:order-1">
          <div className={`border-2 border-[#ffb000] p-4 bg-black/70 box-glow ${cardHoverClass}`}>
            <div className="bg-[#ffb000] text-black px-2 mb-4 font-bold inline-block">输入参数</div>
            
            <RetroInput 
              label="用户查询" 
              value={params.query} 
              onChange={(e) => setParams({...params, query: e.target.value})}
            />
            
            <RetroInput 
              label="Chroma 数据库路径" 
              value={params.chroma_path} 
              onChange={(e) => setParams({...params, chroma_path: e.target.value})}
            />
            
            <div className="mb-6">
              <label className="text-[#ffb000] text-sm uppercase tracking-wider block mb-2">
                最大纠正轮次: <span className="text-white">{params.max_correction_rounds}</span>
              </label>
              <input 
                type="range" 
                min="1" 
                max="5" 
                value={params.max_correction_rounds}
                onChange={(e) => setParams({...params, max_correction_rounds: parseInt(e.target.value)})}
                className="w-full accent-[#ffb000] h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="flex gap-4">
              <button 
                onClick={handleReset}
                disabled={isLoading || !result}
                className={`flex-1 py-3 text-lg font-bold uppercase border-2 transition-all 
                  ${!result
                    ? 'border-gray-800 text-gray-700 cursor-not-allowed'
                    : 'border-red-600 text-red-600 hover:bg-red-900/20 hover:shadow-[0_0_15px_rgba(220,38,38,0.4)]'
                  }`}
              >
                重置
              </button>
              <button 
                onClick={handleStart}
                disabled={isLoading}
                className={`flex-[2] py-3 text-lg font-bold uppercase border-2 transition-all relative overflow-hidden group
                  ${isLoading 
                    ? 'border-[#ffb000] text-[#ffb000] bg-black/50 cursor-not-allowed' 
                    : 'border-[#ffb000] bg-[#ffb000] text-black hover:bg-black hover:text-[#ffb000] hover:shadow-[0_0_20px_#ffb000]'
                  }`}
              >
                {isLoading ? (
                  <>
                    <div className="flex items-center justify-center gap-3 relative z-10">
                      {/* Retro Spinner */}
                      <svg className="animate-spin h-5 w-5 text-[#ffb000]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="animate-pulse">正在处理...</span>
                    </div>
                    {/* Bottom Progress Bar */}
                    <div className="absolute bottom-0 left-0 h-1 bg-[#ffb000] w-full animate-[pulse_1.5s_ease-in-out_infinite] origin-left"></div>
                  </>
                ) : (
                  "执行序列"
                )}
              </button>
            </div>
          </div>

          {/* SYSTEM LOGS (Live Visualization) */}
          <div className={`border-2 border-[#ffb000] p-4 bg-black/70 flex-grow min-h-[300px] lg:h-auto flex flex-col relative overflow-hidden box-glow ${cardHoverClass}`}>
            <div className="absolute top-0 right-0 p-1 text-xs opacity-50">/var/log/syslog</div>
            
            <div className="flex justify-between items-center mb-2">
              <div className="bg-[#ffb000] text-black px-2 font-bold inline-block">流程日志</div>
              <button 
                onClick={() => setShowDebug(!showDebug)}
                className="text-[10px] md:text-xs uppercase border border-[#ffb000]/50 px-2 py-0.5 hover:bg-[#ffb000] hover:text-black transition-colors"
              >
                {showDebug ? "隐藏调试" : "显示调试"}
              </button>
            </div>

            <div className="overflow-y-auto flex-grow font-mono text-sm space-y-1 pr-2 max-h-[400px] lg:max-h-none">
               {!result && !isLoading && <div className="opacity-50">等待输入...</div>}
               {isLoading && (
                 <div className="animate-pulse text-[#ffb000]">
                   <div className="mb-1">> 初始化神经接口...</div>
                   <div className="mb-1">> 连接向量库中... [OK]</div>
                   <div className="mb-1">> 嵌入查询张量中...</div>
                   <div className="mb-1">> 计算余弦相似度矩阵...</div>
                   <div className="mb-1 text-amber-300">> 检测到潜在的幻觉模式...</div>
                 </div>
               )}
               {result?.process_log
                .filter(log => showDebug || log.level !== 'INFO')
                .map((log, idx) => (
                 <div key={idx} className={`
                   ${log.level === 'CRITICAL' ? 'text-red-500 font-bold bg-red-900/10' : ''}
                   ${log.level === 'SUCCESS' ? 'text-green-400' : ''}
                   ${log.level === 'WARN' ? 'text-orange-300' : ''}
                   border-l-2 border-transparent hover:border-[#ffb000] pl-1 transition-all
                 `}>
                   <span className="opacity-40 text-xs">[{log.timestamp.split('T')[1]?.split('.')[0] || '00:00:00'}]</span> <span className="text-xs uppercase opacity-70 w-12 inline-block">{log.level}</span> {log.message}
                 </div>
               ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: RESULTS */}
        <div className="lg:col-span-8 flex flex-col gap-6 order-2 lg:order-2 h-full">
          
          {/* Toggle View Mode */}
          {result && (
            <div className="flex justify-end mb-[-10px] z-10">
              <div className="inline-flex bg-black border border-[#ffb000]/50 rounded overflow-hidden">
                <button 
                  onClick={() => setViewMode('text')}
                  className={`px-4 py-1 text-xs uppercase ${viewMode === 'text' ? 'bg-[#ffb000] text-black font-bold' : 'text-[#ffb000] hover:bg-[#ffb000]/20'}`}
                >
                  文本报告
                </button>
                <div className="w-[1px] bg-[#ffb000]/50"></div>
                <button 
                  onClick={() => setViewMode('dashboard')}
                  className={`px-4 py-1 text-xs uppercase ${viewMode === 'dashboard' ? 'bg-[#ffb000] text-black font-bold' : 'text-[#ffb000] hover:bg-[#ffb000]/20'}`}
                >
                  数据仪表盘
                </button>
              </div>
            </div>
          )}

          {/* VIEW MODE: DASHBOARD */}
          {result && viewMode === 'dashboard' && (
            <div className={`border-2 border-[#ffb000] bg-black/80 p-6 grid grid-cols-1 md:grid-cols-2 gap-8 min-h-[400px] relative animate-in fade-in zoom-in duration-300 box-glow`}>
              {/* Radar Chart */}
              <div className="flex flex-col items-center justify-center relative">
                 <h3 className="text-[#ffb000] text-lg uppercase tracking-widest mb-4 border-b border-[#ffb000]/30 pb-1 w-full text-center">多维性能分析</h3>
                 <div className="w-full h-[300px]">
                   <ResponsiveContainer width="100%" height="100%">
                     <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                       <PolarGrid stroke="#333" />
                       <PolarAngleAxis dataKey="subject" tick={{ fill: '#ffb000', fontSize: 12 }} />
                       <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#666" />
                       <Radar name="初始回答" dataKey="A" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
                       <Radar name="最终回答" dataKey="B" stroke="#22c55e" fill="#22c55e" fillOpacity={0.4} />
                       <Legend wrapperStyle={{ color: '#ffb000' }} />
                       <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #ffb000', color: '#ffb000' }} />
                     </RadarChart>
                   </ResponsiveContainer>
                 </div>
              </div>

              {/* Stats Panel */}
              <div className="flex flex-col gap-4">
                 <h3 className="text-[#ffb000] text-lg uppercase tracking-widest mb-4 border-b border-[#ffb000]/30 pb-1 w-full text-center">核心指标</h3>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-red-900/10 border border-red-500/50 p-4 text-center">
                      <div className="text-xs text-red-400 uppercase mb-1">初始幻觉率</div>
                      <div className="text-4xl font-bold text-red-500">
                        <AnimatedCounter value={result.llm_comparison.initial_hallucination_score} />%
                      </div>
                    </div>
                    <div className="bg-green-900/10 border border-green-500/50 p-4 text-center">
                      <div className="text-xs text-green-400 uppercase mb-1">最终幻觉率</div>
                      <div className="text-4xl font-bold text-green-500">
                        <AnimatedCounter value={result.llm_comparison.final_hallucination_score} />%
                      </div>
                    </div>
                 </div>

                 <div className="flex-grow flex items-center justify-center mt-4">
                    <div className="w-full h-[180px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="100%" barSize={20} data={radialData} startAngle={180} endAngle={0}>
                          <RadialBar
                            label={{ position: 'insideStart', fill: '#fff' }}
                            background
                            dataKey="value"
                          />
                          <Legend iconSize={10} layout="vertical" verticalAlign="middle" wrapperStyle={{right: 0}} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[20%] text-center">
                        <div className="text-2xl font-bold text-green-400">
                          <AnimatedCounter value={100 - result.llm_comparison.final_hallucination_score} />
                        </div>
                        <div className="text-[10px] uppercase opacity-60">总体置信度</div>
                      </div>
                    </div>
                 </div>
              </div>
              
              {/* Decorative elements */}
              <div className="absolute top-2 left-2 w-2 h-2 bg-[#ffb000] animate-pulse"></div>
              <div className="absolute bottom-2 right-2 w-2 h-2 bg-[#ffb000] animate-pulse"></div>
              <div className="absolute top-2 right-2 w-4 h-4 border-t border-r border-[#ffb000]"></div>
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b border-l border-[#ffb000]"></div>
            </div>
          )}

          {/* VIEW MODE: TEXT CARDS */}
          {(!result || viewMode === 'text') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               {/* Initial Answer */}
               <div className={`border-2 border-red-900/50 p-4 bg-red-900/10 relative transition-all duration-300 hover:scale-[1.02] hover:border-red-500 hover:shadow-[0_0_15px_rgba(220,38,38,0.3)] min-h-[200px] backdrop-blur-sm`}>
                 <div className="absolute -top-3 left-4 bg-red-900 text-red-100 px-2 text-xs border border-red-500 uppercase tracking-wider">初始输出 (Alpha)</div>
                 <div className="mt-2 text-sm md:text-base leading-relaxed text-red-200/80 font-serif md:font-mono">
                   {result ? result.initial_answer : <span className="opacity-30 animate-pulse">等待数据流...</span>}
                 </div>
                 {result && (
                   <div className="mt-4 text-xs text-red-400 border-t border-red-900 pt-2 flex justify-between items-center">
                     <span>幻觉评分:</span>
                     <span className="font-bold text-xl">
                       <AnimatedCounter value={result.llm_comparison.initial_hallucination_score} />%
                     </span>
                   </div>
                 )}
               </div>

               {/* Final Answer */}
               <div className={`border-2 border-green-900/50 p-4 bg-green-900/10 relative transition-all duration-300 hover:scale-[1.02] hover:border-green-500 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)] min-h-[200px] flex flex-col backdrop-blur-sm`}>
                 <div className="absolute -top-3 left-4 bg-green-900 text-green-100 px-2 text-xs border border-green-500 uppercase tracking-wider">纠正后输出 (Omega)</div>
                 <div className="mt-2 text-sm md:text-base leading-relaxed text-green-200/90 font-serif md:font-mono flex-grow">
                   {result ? result.final_answer : <span className="opacity-30 animate-pulse">等待数据流...</span>}
                 </div>
                 
                 {result && (
                   <div className="mt-4 border-t border-green-900 pt-2">
                     <div className="flex justify-between items-center text-xs text-green-400 mb-2">
                       <span>幻觉评分: <span className="font-bold text-xl"><AnimatedCounter value={result.llm_comparison.final_hallucination_score} />%</span></span>
                       <div className="flex items-center gap-2">
                         <span className="opacity-70 text-[10px] uppercase">优化趋势</span>
                         <button 
                           onClick={() => setShowTrendDetail(true)}
                           className="hover:text-white transition-colors border border-green-900/50 bg-black/30 px-1 rounded text-[10px]"
                           title="放大图表"
                         >
                           [+] 放大
                         </button>
                       </div>
                     </div>
                     {/* Embedded Trend Chart */}
                     <div className="h-[60px] w-full bg-black/30 border border-green-900/30 rounded">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData}>
                                <defs>
                                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <Tooltip content={<CustomTooltip />} />
                                <Area 
                                  type="monotone" 
                                  dataKey="score" 
                                  stroke="#22c55e" 
                                  strokeWidth={2} 
                                  fillOpacity={1} 
                                  fill="url(#colorScore)" 
                                  activeDot={{ r: 4, stroke: 'white', strokeWidth: 2 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                     </div>
                   </div>
                 )}
               </div>
            </div>
          )}

          {/* MIDDLE ROW: RETRIEVED CHUNKS (Interactive) */}
          <div className={`border-2 border-[#ffb000] p-4 bg-black/70 flex-grow overflow-hidden flex flex-col ${cardHoverClass} min-h-[300px] box-glow`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
              <div className="bg-[#ffb000] text-black px-2 font-bold uppercase">检索到的知识块 <span className="text-[10px] ml-1 opacity-70">DATA-SHARDS</span></div>
              
              <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                  <div className="flex items-center gap-2 bg-[#ffb000]/10 px-2 py-1 border border-[#ffb000]/30 rounded flex-grow sm:flex-grow-0">
                    <span className="text-[10px] uppercase text-[#ffb000] whitespace-nowrap">过滤 (> {minRelevance}%)</span>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={minRelevance}
                      onChange={(e) => setMinRelevance(parseInt(e.target.value))}
                      className="w-full sm:w-20 accent-[#ffb000] h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="text-xs hidden md:block opacity-50">来源: CHROMA_DB</div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto p-1 pr-2 max-h-[400px]">
              {result ? (
                filteredChunks.length > 0 ? filteredChunks.map((chunk) => {
                  const isExpanded = expandedChunks.has(chunk.id);
                  return (
                    <div 
                      key={chunk.id} 
                      onClick={() => toggleChunk(chunk.id)}
                      className={`border border-[#ffb000] p-2 bg-[#ffb000]/5 hover:bg-[#ffb000]/10 transition-all duration-200 cursor-pointer group flex flex-col ${isExpanded ? 'h-auto' : 'h-full'} hover:shadow-[0_0_10px_rgba(255,176,0,0.15)] hover:border-amber-400`}
                    >
                      <div className="flex justify-between text-xs mb-2 border-b border-[#ffb000]/30 pb-1">
                        <span className="truncate max-w-[100px] font-semibold text-[#ffb000]" title={chunk.source}>{chunk.source}</span>
                        <span className={`px-1 text-black font-bold ${chunk.relevance_score >= 0.8 ? 'bg-green-500' : 'bg-[#ffb000]'}`}>
                          {(chunk.relevance_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className={`text-xs opacity-80 leading-tight ${isExpanded ? '' : 'line-clamp-6'}`}>
                        {chunk.content}
                      </div>
                      <div className="mt-auto pt-2 text-[10px] text-[#ffb000]/50 text-right group-hover:text-[#ffb000] transition-colors uppercase">
                          {isExpanded ? '[-] 收起' : '[+] 展开'}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="col-span-full text-center py-8 text-sm opacity-50 border border-dashed border-[#ffb000]/30">
                    没有符合过滤条件的块 (> {minRelevance}% 相关度)
                  </div>
                )
              ) : (
                Array.from({length: 3}).map((_, i) => (
                  <div key={i} className="border border-dashed border-[#ffb000]/30 p-2 h-32 flex items-center justify-center opacity-30 animate-pulse">
                    [等待数据输入...]
                  </div>
                ))
              )}
            </div>
          </div>

          {/* BOTTOM ROW: ANALYTICS */}
          {result && (
            <div className={`border-t-2 border-[#ffb000] pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 ${cardHoverClass} p-4 bg-black/40 box-glow`}>
              <div>
                <h3 className="text-sm uppercase mb-2 border-b border-[#ffb000]/30 inline-block pr-4">纠正动作日志</h3>
                <ul className="text-xs space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                  {result.correction_history.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-amber-300 font-bold whitespace-nowrap bg-amber-900/30 px-1">R{step.round}</span>
                      <span className="opacity-80">{step.reasoning}</span>
                    </li>
                  ))}
                  {result.correction_history.length === 0 && <li className="opacity-50 italic">本次查询无需纠正，直接通过一致性检查。</li>}
                </ul>
              </div>
              <div className="h-32 hidden md:block">
                 <h3 className="text-sm uppercase mb-2 border-b border-[#ffb000]/30 inline-block pr-4">效果量化</h3>
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: '初始', score: result.llm_comparison.initial_hallucination_score },
                      { name: '最终', score: result.llm_comparison.final_hallucination_score }
                    ]} layout="vertical" margin={{ left: 0, right: 20 }}>
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis dataKey="name" type="category" width={40} tick={{fill: '#ffb000', fontSize: 10}} />
                      <Tooltip 
                        contentStyle={{backgroundColor: '#000', border: '1px solid #ffb000', color: '#ffb000', fontSize: '12px'}} 
                        itemStyle={{color: '#ffb000'}}
                        cursor={{fill: 'rgba(255,176,0,0.1)'}}
                      />
                      <Bar dataKey="score" barSize={15}>
                        {
                           [
                              { name: '初始', score: result.llm_comparison.initial_hallucination_score },
                              { name: '最终', score: result.llm_comparison.final_hallucination_score }
                            ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? '#ef4444' : '#22c55e'} />
                          ))
                        }
                      </Bar>
                    </BarChart>
                 </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: TREND CHART DETAIL */}
      {showTrendDetail && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-4xl border-2 border-[#ffb000] bg-black/80 p-6 box-glow relative shadow-[0_0_50px_rgba(34,197,94,0.1)]">
                <button 
                    onClick={() => setShowTrendDetail(false)}
                    className="absolute top-0 right-0 p-3 text-[#ffb000] hover:text-white font-bold hover:bg-red-900/50 transition-colors"
                >
                    [X] 关闭视窗
                </button>
                <div className="flex items-center gap-3 mb-6 border-b border-[#ffb000]/30 pb-2">
                    <h3 className="text-xl text-[#ffb000] font-bold uppercase tracking-wider">
                        幻觉评分优化趋势详情
                    </h3>
                    <span className="text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded border border-green-700/50">
                        实时监控数据
                    </span>
                </div>
                
                <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorScoreLarge" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis dataKey="name" stroke="#ffb000" tick={{fill: '#ffb000', fontSize: 12}} />
                            <YAxis stroke="#ffb000" tick={{fill: '#ffb000', fontSize: 12}} domain={[0, 100]} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area 
                                type="monotone" 
                                dataKey="score" 
                                stroke="#22c55e" 
                                strokeWidth={3}
                                fillOpacity={1} 
                                fill="url(#colorScoreLarge)" 
                                activeDot={{ r: 8, strokeWidth: 2, stroke: '#fff' }}
                                dot={{ r: 4, stroke: '#22c55e', strokeWidth: 2, fill: '#000' }}
                            />
                            <Brush 
                                dataKey="name" 
                                height={30} 
                                stroke="#22c55e" 
                                fill="#111" 
                                tickFormatter={() => ''}
                            />
                            <ReferenceLine y={0} stroke="#000" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                
                <div className="mt-4 flex justify-between items-center text-xs text-gray-500 font-mono">
                    <div>
                        提示: 拖动底部绿色滑块 (BRUSH) 可缩放/平移时间轴以查看特定纠正轮次。
                    </div>
                    <div>
                        数据来源: RAG-HC 内部评估核心
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;