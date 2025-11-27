import React, { useEffect, useState, useRef } from 'react';

interface BootSequenceProps {
  onComplete: () => void;
}

const BootSequence: React.FC<BootSequenceProps> = ({ onComplete }) => {
  const [stage, setStage] = useState<'BIOS' | 'MEMORY' | 'LOAD' | 'LOG' | 'READY'>('BIOS');
  const [memoryCount, setMemoryCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const asciiLogo = `
██████╗  █████╗  ██████╗       ██╗  ██╗ ██████╗ 
██╔══██╗██╔══██╗██╔════╝       ██║  ██║██╔════╝ 
██████╔╝███████║██║  ███╗█████╗███████║██║      
██╔══██╗██╔══██║██║   ██║╚════╝██╔══██║██║      
██║  ██║██║  ██║╚██████╔╝      ██║  ██║╚██████╗ 
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝       ╚═╝  ╚═╝ ╚═════╝ 
`;

  // Stage 1: Memory Count
  useEffect(() => {
    if (stage === 'BIOS') {
      const timer = setTimeout(() => setStage('MEMORY'), 800);
      return () => clearTimeout(timer);
    }

    if (stage === 'MEMORY') {
      const interval = setInterval(() => {
        setMemoryCount(prev => {
          if (prev >= 65536) {
            clearInterval(interval);
            setStage('LOAD');
            return 65536;
          }
          return prev + 1024; // Fast count
        });
      }, 20);
      return () => clearInterval(interval);
    }

    if (stage === 'LOAD') {
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setStage('LOG');
            return 100;
          }
          return prev + 2;
        });
      }, 30);
      return () => clearInterval(interval);
    }

    if (stage === 'LOG') {
      const bootText = [
        "挂载文件系统 (ext4)... 完成",
        "初始化神经处理单元 (NPU)...",
        "  > 加载张量核心 [OK]",
        "  > 验证 CUDA 路径 [OK]",
        "连接 ChromaDB 向量存储...",
        "  > 分片 01: 在线",
        "  > 分片 02: 在线",
        "校准 RAG 检索模型...",
        "应用幻觉检测启发式算法...",
        "安全协议握手...",
        "系统就绪。"
      ];
      
      let index = 0;
      const interval = setInterval(() => {
        if (index >= bootText.length) {
          clearInterval(interval);
          setStage('READY');
          return;
        }
        setLogs(prev => [...prev, bootText[index]]);
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        index++;
      }, 150);
      return () => clearInterval(interval);
    }
  }, [stage]);

  const progressBar = () => {
    const width = 40;
    const filled = Math.floor((progress / 100) * width);
    const empty = width - filled;
    return `[${'#'.repeat(filled)}${'.'.repeat(empty)}] ${progress}%`;
  };

  return (
    <div className="h-screen w-full bg-black text-amber-500 font-mono flex flex-col items-center justify-center p-4 crt overflow-hidden relative select-none">
      <div className="w-full max-w-3xl z-10">
        {/* LOGO AREA */}
        <pre className="text-[0.6rem] sm:text-xs md:text-sm leading-none font-bold text-center text-amber-500 mb-8 opacity-90 text-glow">
          {asciiLogo}
        </pre>

        <div className="border-2 border-amber-600 p-6 bg-gray-900/90 box-glow min-h-[400px] flex flex-col">
          
          {/* HEADER */}
          <div className="flex justify-between border-b border-amber-600/50 pb-2 mb-4 text-sm uppercase">
            <span>RAG-HC BIOS v2.0.77</span>
            <span>{new Date().toISOString().split('T')[0]}</span>
          </div>

          {/* CONTENT AREA */}
          <div className="flex-grow font-mono text-lg space-y-4">
            
            {/* MEMORY CHECK */}
            <div className="flex justify-between items-center">
              <span>系统内存检测:</span>
              <span className="font-bold">{memoryCount} KB OK</span>
            </div>

            {/* PROGRESS BAR */}
            {stage !== 'MEMORY' && stage !== 'BIOS' && (
              <div className="space-y-1">
                <div>加载核心模块...</div>
                <div className="text-amber-300 break-all whitespace-pre-wrap">{progressBar()}</div>
              </div>
            )}

            {/* LOGS */}
            {(stage === 'LOG' || stage === 'READY') && (
              <div 
                ref={scrollRef}
                className="h-40 overflow-y-auto border border-amber-800/50 p-2 bg-black/40 text-sm space-y-1 mt-4"
              >
                {logs.map((log, i) => (
                  <div key={i} className="flex">
                    <span className="opacity-50 mr-2">[{1000 + i * 42}]</span>
                    <span>{log}</span>
                  </div>
                ))}
                {stage === 'LOG' && <div className="animate-pulse">_</div>}
              </div>
            )}
          </div>

          {/* FOOTER ACTION */}
          <div className="mt-6 flex justify-center h-16 items-center">
            {stage === 'READY' ? (
              <button 
                onClick={onComplete}
                className="group relative px-10 py-3 bg-amber-500 text-black font-bold text-xl uppercase tracking-widest hover:bg-amber-400 transition-all hover:scale-105 active:scale-95 outline-none"
              >
                <span className="relative z-10 animate-pulse">初始化系统交互 >></span>
                <div className="absolute inset-0 bg-amber-400 blur-xl opacity-40 group-hover:opacity-80 transition-opacity"></div>
              </button>
            ) : (
              <div className="text-xs uppercase opacity-50 animate-pulse">
                {stage === 'BIOS' ? '等待电源...' : '正在处理...'}
              </div>
            )}
          </div>

        </div>

        <div className="text-center mt-4 text-xs opacity-40 uppercase tracking-[0.5em]">
          Restricted Access // Sector 7
        </div>
      </div>
    </div>
  );
};

export default BootSequence;