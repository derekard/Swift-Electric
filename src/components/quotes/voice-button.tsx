"use client"

import { useRef, useState } from "react"
import { Loader2, Mic, Square } from "lucide-react"
import { toast } from "sonner"

import type { PriceBookItem } from "@/lib/supabase/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

export type VoiceArea = {
  name: string
  lines: { price_book_item_id: string | null; description: string; qty: number }[]
}

// Minimal Web Speech API typings (not in the standard DOM lib).
type SRResultList = ArrayLike<ArrayLike<{ transcript: string }>>
interface SREvent {
  resultIndex: number
  results: SRResultList
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type SRConstructor = new () => SpeechRecognitionLike

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor
    webkitSpeechRecognition?: SRConstructor
  }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

export function VoiceButton({
  priceBook,
  onAreas,
}: {
  priceBook: PriceBookItem[]
  onAreas: (areas: VoiceArea[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [transcript, setTranscript] = useState("")
  const recogRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef("")

  function start() {
    const recog = getRecognition()
    if (!recog) {
      toast.error("Voice input isn't supported in this browser. Try Chrome.")
      return
    }
    finalRef.current = ""
    setTranscript("")
    recog.lang = "en-CA"
    recog.continuous = true
    recog.interimResults = true
    recog.onresult = (e) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript
        // results that are "final" still come through; accumulate everything
        interim += text
      }
      setTranscript(finalRef.current + interim)
    }
    recog.onerror = (e) => {
      if (e.error !== "aborted") toast.error(`Mic error: ${e.error}`)
    }
    recog.onend = () => setListening(false)
    recogRef.current = recog
    setOpen(true)
    setListening(true)
    recog.start()
  }

  function stopListening() {
    recogRef.current?.stop()
    setListening(false)
  }

  async function parse() {
    const text = transcript.trim()
    if (!text) {
      toast.error("Nothing captured yet.")
      return
    }
    setParsing(true)
    try {
      const res = await fetch("/api/voice-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          priceBook: priceBook.map((p) => ({
            id: p.id,
            name: p.name,
            unit_price: Number(p.unit_price),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't understand that.")
        return
      }
      const areas = (data.areas ?? []) as VoiceArea[]
      if (areas.length === 0) {
        toast.error("No items recognised — try again.")
        return
      }
      onAreas(areas)
      const count = areas.reduce((n, a) => n + a.lines.length, 0)
      toast.success(`Added ${count} item${count === 1 ? "" : "s"} from voice`)
      setOpen(false)
    } finally {
      setParsing(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={start}>
        <Mic /> Dictate
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            recogRef.current?.stop()
            setListening(false)
          }
          setOpen(o)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {listening ? "Listening…" : "Review what you said"}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Describe the job, e.g.{" "}
            <span className="italic">
              &ldquo;In the kitchen, 6 pot lights, two switches and a GFI. In the
              bathroom, an exhaust fan.&rdquo;
            </span>
          </p>

          <div className="min-h-24 rounded-lg border bg-muted/30 p-3 text-sm">
            {transcript || (
              <span className="text-muted-foreground">
                {listening ? "Go ahead, I'm listening…" : "Nothing captured yet."}
              </span>
            )}
          </div>

          <DialogFooter>
            {listening ? (
              <Button variant="outline" onClick={stopListening}>
                <Square /> Stop
              </Button>
            ) : (
              <Button variant="outline" onClick={start} disabled={parsing}>
                <Mic /> Restart
              </Button>
            )}
            <Button onClick={parse} disabled={listening || parsing || !transcript.trim()}>
              {parsing ? <Loader2 className="animate-spin" /> : null}
              {parsing ? "Mapping…" : "Add items"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
