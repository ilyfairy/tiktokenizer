import { ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/Button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandSeparator,
} from "~/components/Command";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/Popover";
import {
  type AllOptions,
  MODEL_OPTIONS,
  POPULAR,
  getModelOption,
} from "~/models";

export function EncoderSelect(props: {
  value: AllOptions;
  onChange: (value: AllOptions) => void;
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = getModelOption(props.value);
  const selectedCommandValue = `${selected.id} ${selected.label} ${selected.group}`;
  const [commandValue, setCommandValue] = useState(selectedCommandValue);
  useEffect(
    () => setCommandValue(selectedCommandValue),
    [selectedCommandValue]
  );
  const popular = POPULAR.map((id) => getModelOption(id));
  const groups = Array.from(
    new Set(MODEL_OPTIONS.map((option) => option.group))
  );

  function renderOption(option: (typeof MODEL_OPTIONS)[number]) {
    return (
      <CommandItem
        key={option.id}
        value={`${option.id} ${option.label} ${option.group}`}
        onSelect={() => {
          setOpen(false);
          props.onChange(option.id);
        }}
        className="gap-3"
      >
        <span className="flex-grow">{option.label}</span>
        {option.accuracy !== "exact" && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">
            {option.accuracy === "estimate" ? "Estimate" : "Legacy"}
          </span>
        )}
      </CommandItem>
    );
  }

  return (
    <div className="max-w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Choose model or encoding"
            className="w-[300px] max-w-full justify-between"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{selected?.label ?? props.value}</span>
              <span
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 rounded-full border-2 border-gray-700 border-b-transparent ${
                  props.isLoading ? "animate-spin" : "invisible"
                }`}
              />
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="max-h-[70vh] w-[340px] max-w-[calc(100vw-32px)] overflow-auto p-0 pb-2">
          <Command value={commandValue} onValueChange={setCommandValue}>
            <CommandInput placeholder="Search model or encoding..." />
            <CommandEmpty>No model or encoding found.</CommandEmpty>
            <CommandGroup heading="Popular">
              {popular.map(renderOption)}
            </CommandGroup>
            {groups.map((group) => {
              const options = MODEL_OPTIONS.filter(
                (option) =>
                  option.group === group && !POPULAR.includes(option.id)
              );
              if (options.length === 0) return null;
              return (
                <div key={group}>
                  <CommandSeparator />
                  <CommandGroup heading={group}>
                    {options.map(renderOption)}
                  </CommandGroup>
                </div>
              );
            })}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
