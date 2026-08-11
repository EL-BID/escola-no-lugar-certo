import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  size?: 'sm' | 'md';
};

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, size = 'md', ...props }, ref) => {
  const value = props.value || props.defaultValue || [0];
  const thumbCount = Array.isArray(value) ? value.length : 1;

  const trackHeight = size === 'sm' ? 'h-1.5' : 'h-2';
  const thumbSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className={cn("relative w-full grow overflow-hidden rounded-full bg-gray-400", trackHeight)}>
        <SliderPrimitive.Range className="absolute h-full bg-blue-500" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }).map((_, i) => (
        <SliderPrimitive.Thumb 
          key={i}
          className={cn("block rounded-full bg-blue-500 hover:bg-blue-600 shadow-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", thumbSize)} 
        />
      ))}
    </SliderPrimitive.Root>
  );
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
