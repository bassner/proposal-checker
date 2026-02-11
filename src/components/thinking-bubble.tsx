"use client";

export function ThinkingBubble() {
  return (
    <div className="flex items-center gap-1.5 px-1">
      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:0ms]" />
      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:150ms]" />
      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" />
    </div>
  );
}
