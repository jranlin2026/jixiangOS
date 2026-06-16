import { useState, useCallback } from 'react';

interface UseAIQueryReturn {
  response: string;
  isStreaming: boolean;
  startStream: (fullText: string, onComplete?: () => void) => void;
  reset: () => void;
}

/**
 * AI 查询 Hook — 模拟流式输出，逐字显示
 */
export function useAIQuery(): UseAIQueryReturn {
  const [response, setResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const startStream = useCallback((fullText: string, onComplete?: () => void) => {
    setResponse('');
    setIsStreaming(true);
    let index = 0;

    const streamInterval = setInterval(() => {
      if (index < fullText.length) {
        setResponse(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(streamInterval);
        setIsStreaming(false);
        onComplete?.();
      }
    }, 30);

    return () => clearInterval(streamInterval);
  }, []);

  const reset = useCallback(() => {
    setResponse('');
    setIsStreaming(false);
  }, []);

  return { response, isStreaming, startStream, reset };
}

export default useAIQuery;
