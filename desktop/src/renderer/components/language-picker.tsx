import { Button } from "@/renderer/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/renderer/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/renderer/components/ui/popover";
import { setAppLanguage } from "@/renderer/helpers/i18n/language-helpers";
import { AVAILABLE_LANGUAGES } from "@/renderer/helpers/i18n/languages";
import { cn } from "@/renderer/lib/utils";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

interface LanguagePickerProps {
  isIconFormat?: boolean;
  className?: string;
}

export function LanguagePicker({ isIconFormat = false, className }: LanguagePickerProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(i18n.language);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {isIconFormat ? (
          <Button variant="ghost" size="icon" className={cn("h-7 w-7", className)}>
            <Globe className="h-[1.2rem] w-[1.2rem]" />
            <span className="sr-only">Change language</span>
          </Button>
        ) : (
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[200px] justify-between"
          >
            {value
              ? AVAILABLE_LANGUAGES.find((language) => language.code === value)?.name
              : "Select language..."}
            <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="end">
        <Command
          filter={(value: string, search: string) => {
            const name = AVAILABLE_LANGUAGES.find(
              (language) => language.code === value
            )?.name.toLowerCase();
            if (name.includes(search.toLowerCase())) return 1;
            return 0;
          }}
        >
          <CommandInput placeholder="Search language..." />
          <CommandList>
            <CommandEmpty>No language found.</CommandEmpty>
            <CommandGroup>
              {AVAILABLE_LANGUAGES.map((language) => (
                <CommandItem
                  key={language.code}
                  value={language.code}
                  onSelect={(currentValue: string) => {
                    setValue(currentValue === value ? "" : currentValue);
                    setOpen(false);
                    void setAppLanguage(language.code, i18n);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === language.code ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {language.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
