"use client"

import { ExternalLink } from "lucide-react"

import type { JobSitePhoto } from "@/lib/supabase/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function PhotoViewerDialog({
  photo,
  onClose,
}: {
  photo: JobSitePhoto | null
  onClose: () => void
}) {
  const src = photo ? `/api/site-photo/${photo.id}` : ""
  const title = photo?.caption || photo?.label || "Photo"

  return (
    <Dialog
      open={!!photo}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] gap-3 p-3 sm:max-w-5xl">
        <DialogHeader className="pr-10">
          <DialogTitle className="capitalize">{title}</DialogTitle>
        </DialogHeader>

        {photo ? (
          <>
            <div className="overflow-hidden rounded-lg bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={photo.caption ?? photo.label}
                className="max-h-[72svh] w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {photo.width && photo.height
                  ? `${photo.width} x ${photo.height}`
                  : "Site photo"}
              </p>
              <Button
                render={<a href={src} target="_blank" rel="noreferrer" />}
                variant="outline"
              >
                <ExternalLink /> Open
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
