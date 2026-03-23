import { getCurrentTheme, setTheme } from "@/renderer/helpers/theme/theme-helper";
import { Theme } from "@/shared/types/theme";
import { Check, ChevronsUpDown, Palette } from "lucide-react";
import React, { useEffect, useState } from "react";

import { AVAILABLE_THEMES } from "../helpers/theme/themes";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface ThemePickerProps {
  isIconFormat?: boolean;
  className?: string;
}

export function ThemePicker({ isIconFormat = false, className }: ThemePickerProps) {
  const [currentTheme, setCurrentTheme] = useState<Theme>("system");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const initTheme = async () => {
      const themePreferences = await getCurrentTheme();
      if (themePreferences) {
        setCurrentTheme(themePreferences.local);
      }
    };

    void initTheme();
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {isIconFormat ? (
          <Button variant="ghost" size="icon" className={cn("h-7 w-7", className)}>
            <Palette className="h-[1.2rem] w-[1.2rem]" />
            <span className="sr-only">Change theme</span>
          </Button>
        ) : (
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-[200px] justify-between", className)}
          >
            {currentTheme
              ? AVAILABLE_THEMES.find((theme) => theme.value === currentTheme)?.label
              : "Select theme..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="end">
        <Command>
          <CommandList>
            <CommandGroup>
              {AVAILABLE_THEMES.map((theme) => (
                <CommandItem
                  key={theme.value}
                  value={theme.value}
                  onSelect={(currentValue: Theme) => {
                    void setTheme(currentValue);
                    void setCurrentTheme(currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      currentTheme === theme.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {theme.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
