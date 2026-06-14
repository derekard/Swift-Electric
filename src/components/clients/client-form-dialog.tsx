"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import type { Client } from "@/lib/supabase/types"
import {
  createClientAction,
  updateClientAction,
  type ClientInput,
} from "@/app/(app)/clients/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Invalid email").or(z.literal("")),
  phone: z.string().trim(),
  address: z.string().trim(),
  notes: z.string().trim(),
})

type FormValues = z.infer<typeof schema>

const empty: FormValues = {
  name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
}

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  client?: Client | null
  onSaved?: (id?: string) => void
}) {
  const editing = !!client
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: empty,
  })

  useEffect(() => {
    if (open) {
      form.reset(
        client
          ? {
              name: client.name,
              email: client.email ?? "",
              phone: client.phone ?? "",
              address: client.address ?? "",
              notes: client.notes ?? "",
            }
          : empty
      )
    }
  }, [open, client, form])

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    const payload: ClientInput = values
    const res = editing
      ? await updateClientAction(client!.id, payload)
      : await createClientAction(payload)
    setSubmitting(false)

    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(editing ? "Client updated" : "Client added")
    onOpenChange(false)
    onSaved?.(res.ok && "data" in res && res.data ? res.data.id : undefined)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit client" : "New client"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-4"
            id="client-form"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl render={<Input placeholder="Jane Doe" {...field} />} />
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl
                      render={
                        <Input type="email" placeholder="jane@email.com" {...field} />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl render={<Input placeholder="(905) 555-0100" {...field} />} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl
                    render={<Input placeholder="Street, City, Province" {...field} />}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl render={<Textarea rows={2} {...field} />} />
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="client-form" disabled={submitting}>
            {submitting ? "Saving…" : editing ? "Save changes" : "Add client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
