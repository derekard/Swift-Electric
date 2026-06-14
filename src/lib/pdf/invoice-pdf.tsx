import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer"

import { money } from "@/lib/format"

export type InvoiceDoc = {
  company: {
    name: string
    licenseNumber: string | null
    ownerName: string | null
    address: string | null
    phone: string | null
    email: string | null
  }
  invoiceNumber: string
  issuedDate: string
  dueDate: string
  isPaid: boolean
  clientName: string | null
  clientAddress: string | null
  quoteNumber: string | null
  billingType: "fixed" | "tm"
  laborAmount: number
  materialsAmount: number
  amountPretax: number
  hstAmount: number
  total: number
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10.5,
    fontFamily: "Helvetica",
    color: "#18181b",
    lineHeight: 1.45,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
    paddingBottom: 14,
  },
  companyName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  muted: { color: "#71717a" },
  small: { fontSize: 8.5, color: "#a1a1aa" },
  rightCol: { textAlign: "right" },
  section: { marginTop: 16 },
  label: { fontSize: 8.5, color: "#a1a1aa", textTransform: "uppercase" },
  recipientName: { fontFamily: "Helvetica-Bold" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  lineTable: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    paddingTop: 8,
  },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totals: { marginLeft: "auto", width: 220, marginTop: 12 },
  totalsLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  totalsStrong: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#18181b",
    paddingTop: 5,
    marginTop: 3,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  paidStamp: {
    marginTop: 18,
    color: "#15803d",
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
  },
  terms: { marginTop: 26, fontSize: 9, color: "#71717a" },
})

export function InvoicePdfDocument({ doc }: { doc: InvoiceDoc }) {
  const description = doc.quoteNumber
    ? `Electrical work as per estimate ${doc.quoteNumber}`
    : "Electrical work as quoted"

  return (
    <Document title={`Invoice ${doc.invoiceNumber}`} author={doc.company.name}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.companyName}>{doc.company.name}</Text>
            {doc.company.ownerName ? (
              <Text style={styles.muted}>{doc.company.ownerName}</Text>
            ) : null}
            <Text style={styles.muted}>Master Electrician</Text>
            {doc.company.licenseNumber ? (
              <Text style={styles.small}>
                ECRA/ESA {doc.company.licenseNumber}
              </Text>
            ) : null}
          </View>
          <View style={styles.rightCol}>
            <Text style={styles.title}>INVOICE</Text>
            <Text style={styles.muted}>{doc.invoiceNumber}</Text>
            {doc.company.phone ? (
              <Text style={styles.muted}>{doc.company.phone}</Text>
            ) : null}
            {doc.company.email ? (
              <Text style={styles.muted}>{doc.company.email}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.metaRow}>
          <View>
            <Text style={styles.label}>Bill to</Text>
            <Text style={styles.recipientName}>
              {doc.clientName ?? "—"}
            </Text>
            {doc.clientAddress ? (
              <Text style={styles.muted}>{doc.clientAddress}</Text>
            ) : null}
          </View>
          <View style={styles.rightCol}>
            <Text style={styles.label}>Issued</Text>
            <Text>{doc.issuedDate}</Text>
            <Text style={[styles.label, { marginTop: 6 }]}>Due</Text>
            <Text>{doc.dueDate}</Text>
          </View>
        </View>

        <View style={styles.lineTable}>
          {doc.billingType === "tm" ? (
            <>
              <View style={styles.lineRow}>
                <Text>Labour (time &amp; materials)</Text>
                <Text>{money(doc.laborAmount)}</Text>
              </View>
              <View style={styles.lineRow}>
                <Text>Materials</Text>
                <Text>{money(doc.materialsAmount)}</Text>
              </View>
            </>
          ) : (
            <View style={styles.lineRow}>
              <Text>{description}</Text>
              <Text>{money(doc.amountPretax)}</Text>
            </View>
          )}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsLine}>
            <Text style={styles.muted}>Subtotal</Text>
            <Text>{money(doc.amountPretax)}</Text>
          </View>
          <View style={styles.totalsLine}>
            <Text style={styles.muted}>HST</Text>
            <Text>{money(doc.hstAmount)}</Text>
          </View>
          <View style={styles.totalsStrong}>
            <Text style={styles.bold}>Total</Text>
            <Text style={styles.bold}>{money(doc.total)}</Text>
          </View>
        </View>

        {doc.isPaid ? (
          <Text style={styles.paidStamp}>PAID — thank you!</Text>
        ) : null}

        <Text style={styles.terms}>
          Please make payment by the due date. Thank you for your business.
        </Text>
      </Page>
    </Document>
  )
}
