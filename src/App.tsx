import { useCallback, useEffect, useRef, useState } from "react";
import { Github } from "lucide-react";

import { ChatGPTEditor } from "./sections/ChatGPTEditor";
import { EncoderSelect } from "~/sections/EncoderSelect";
import { TokenViewer } from "~/sections/TokenViewer";
import { TokenInput } from "~/components/TokenInput";
import { Button } from "~/components/Button";
import {
  type AllOptions,
  DEFAULT_MODEL,
  getModelOption,
  isChatModel,
  isValidOption,
} from "~/models";
import {
  createTokenizer,
  type Tokenizer,
  type TokenizerResult,
} from "~/models/tokenizer";

function readModelFromLocation(): AllOptions {
  const model = new URLSearchParams(window.location.search).get("model");
  return isValidOption(model) ? model : DEFAULT_MODEL;
}

function useQueryParamsState() {
  const [params, setParams] = useState<AllOptions>(readModelFromLocation);

  useEffect(() => {
    const onPopState = () => setParams(readModelFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const updateModel = useCallback((model: AllOptions) => {
    const url = new URL(window.location.href);
    url.searchParams.set("model", model);
    window.history.replaceState(window.history.state, "", url);
    setParams(model);
  }, []);

  return [params, updateModel, true] as const;
}

function useLazyTokenizer(model: AllOptions, text: string, ready: boolean) {
  const [tokenizer, setTokenizer] = useState<{
    model: AllOptions;
    instance: Tokenizer;
  }>();
  const [data, setData] = useState<TokenizerResult>();
  const [isLoading, setLoading] = useState(false);
  const [isComputing, setComputing] = useState(false);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    requestRef.current += 1;
    setTokenizer(undefined);
    setError(undefined);
    setLoading(true);
    setComputing(false);

    void createTokenizer(model)
      .then((instance) => {
        if (active) setTokenizer({ model, instance });
      })
      .catch((reason: unknown) => {
        if (active) {
          setData(undefined);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [model, ready, attempt]);

  useEffect(() => {
    if (!tokenizer || tokenizer.model !== model) return;
    let active = true;
    const request = ++requestRef.current;
    setComputing(true);
    setError(undefined);

    // Short debounce keeps rapid typing from queuing work in the tokenizer.
    const timer = window.setTimeout(() => {
      void tokenizer.instance
        .tokenize(text)
        .then((result) => {
          if (active && request === requestRef.current) setData(result);
        })
        .catch((reason: unknown) => {
          if (active && request === requestRef.current) {
            setData(undefined);
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        })
        .finally(() => {
          if (active && request === requestRef.current) setComputing(false);
        });
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [model, text, tokenizer]);

  return {
    data,
    error,
    isLoading: !ready || isLoading,
    isBusy: !ready || isLoading || isComputing,
    retry: () => setAttempt((value) => value + 1),
  };
}

const Home = () => {
  const [inputText, setInputText] = useState<string>("");
  const [model, setModel, ready] = useQueryParamsState();
  const [chatForModel, setChatForModel] = useState<AllOptions>();
  const tokenizer = useLazyTokenizer(model, inputText, ready);
  const option = getModelOption(model);
  const chatEnabled = chatForModel === model;

  useEffect(() => {
    setChatForModel(undefined);
  }, [model]);

  return (
    <>
      <main className="flex h-screen min-h-0 w-full flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <div className="flex shrink-0 flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <h1 className="text-4xl font-bold">Tiktokenizer</h1>

          <EncoderSelect
            value={model}
            isLoading={tokenizer.isLoading}
            onChange={setModel}
          />
        </div>
        {option?.accuracy !== "exact" && option?.accuracy && (
          <p className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {option.accuracy === "estimate"
              ? "Claude’s current tokenizer is not public. This is an offline estimate using Anthropic’s published legacy vocabulary; highlighted tokens and IDs come from that legacy vocabulary. Unicode normalized for this vocabulary."
              : "This uses Anthropic’s published legacy vocabulary. Current Claude models may tokenize differently; the highlighted tokens and IDs are from the legacy vocabulary. Unicode normalized for this vocabulary."}
          </p>
        )}
        {tokenizer.error && (
          <div
            role="alert"
            className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            <span>Unable to calculate tokens. {tokenizer.error}</span>
            <Button variant="outline" size="sm" onClick={tokenizer.retry}>
              Retry
            </Button>
          </div>
        )}
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-4 overflow-auto md:grid-cols-2 md:grid-rows-1 md:overflow-hidden">
          <section className="flex min-h-0 min-w-0 flex-col gap-3">
            {isChatModel(model) && (
              <div className="flex max-h-[35%] shrink-0 flex-col gap-3 overflow-auto">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={chatEnabled}
                    onChange={(event) =>
                      setChatForModel(event.target.checked ? model : undefined)
                    }
                    className="h-4 w-4 accent-slate-800"
                  />
                  Chat messages (legacy ChatML format)
                </label>
                {chatEnabled && (
                  <ChatGPTEditor
                    model={model}
                    initialText={inputText}
                    onChange={setInputText}
                  />
                )}
              </div>
            )}

            <TokenInput
              label="Input text"
              placeholder="Enter text to count tokens…"
              value={inputText}
              onChange={setInputText}
              className="h-full min-h-0 flex-1 resize-none rounded-md border p-4 font-mono shadow-sm"
            />
          </section>

          <section className="flex min-h-0 min-w-0 flex-col gap-3">
            <TokenViewer
              model={model}
              data={tokenizer.data}
              isFetching={tokenizer.isBusy}
              accuracy={tokenizer.data?.accuracy ?? option?.accuracy}
            />
          </section>
        </div>
        <div className="flex shrink-0 items-center justify-between text-center">
          <a
            href="/licenses/index.html"
            className="text-xs text-slate-600 hover:underline"
          >
            Tokenizer licenses
          </a>

          <a
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="text-slate-800"
            href="https://github.com/ilyfairy/tiktokenizer"
          >
            <Github />
          </a>
        </div>
      </main>
    </>
  );
};

export default Home;
