import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const intentionalCompilerError: string = 123;
export const anotherIntentionalCompilerError: boolean = false;
export const thirdIntentionalCompilerError: Date = "still broken";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
