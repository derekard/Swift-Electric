import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer"

import type { QuoteDoc } from "@/lib/quote-doc"
import { money, pct } from "@/lib/format"

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
  muted: { color: "#71717a" },
  small: { fontSize: 8.5, color: "#a1a1aa" },
  rightCol: { textAlign: "right" },
  estimateNo: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  section: { marginTop: 16 },
  recipientName: { fontFamily: "Helvetica-Bold" },
  areaName: { fontFamily: "Helvetica-Bold", marginBottom: 3 },
  bulletRow: { flexDirection: "row", marginBottom: 2, paddingLeft: 6 },
  bulletDot: { width: 10, color: "#a1a1aa" },
  bulletText: { flex: 1 },
  notesTitle: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  totalsWrap: {
    marginTop: 22,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    paddingTop: 12,
  },
  totalRowBig: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  totalLabel: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  hstExtra: { fontSize: 8.5, color: "#71717a", textAlign: "right" },
  totalsTable: { marginLeft: "auto", width: 200 },
  totalsLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  totalsLineStrong: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    paddingTop: 4,
    marginTop: 2,
  },
  bold: { fontFamily: "Helvetica-Bold" },
})

export function QuotePdfDocument({ doc }: { doc: QuoteDoc }) {
  return (
    <Document
      title={`Estimate ${doc.quoteNumber}`}
      author={doc.company.name}
    >
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
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
            <Text style={styles.estimateNo}>Estimate {doc.quoteNumber}</Text>
            <Text style={styles.muted}>{doc.date}</Text>
            {doc.company.phone ? (
              <Text style={styles.muted}>{doc.company.phone}</Text>
            ) : null}
            {doc.company.email ? (
              <Text style={styles.muted}>{doc.company.email}</Text>
            ) : null}
            {doc.company.address ? (
              <Text style={styles.muted}>{doc.company.address}</Text>
            ) : null}
          </View>
        </View>

        {/* Recipient */}
        {doc.client ? (
          <View style={styles.section}>
            <Text style={styles.recipientName}>{doc.client.name}</Text>
            {doc.client.address ? (
              <Text style={styles.muted}>{doc.client.address}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Intro */}
        <View style={styles.section}>
          <Text>{doc.intro}</Text>
        </View>

        {/* Areas */}
        <View style={styles.section}>
          {doc.areas.map((area, i) => (
            <View key={i} style={{ marginBottom: 10 }} wrap={false}>
              <Text style={styles.areaName}>{area.name}</Text>
              {area.bullets.map((b, j) => (
                <View key={j} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* Notes */}
        {doc.notes ? (
          <View style={styles.section}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text>{doc.notes}</Text>
          </View>
        ) : null}

        {/* Total */}
        <View style={styles.totalsWrap}>
          {doc.showHstLine ? (
            <View style={styles.totalsTable}>
              <View style={styles.totalsLine}>
                <Text style={styles.muted}>Subtotal</Text>
                <Text>{money(doc.amountPretax)}</Text>
              </View>
              <View style={styles.totalsLine}>
                <Text style={styles.muted}>HST ({pct(doc.hstRate)})</Text>
                <Text>{money(doc.hstAmount)}</Text>
              </View>
              <View style={styles.totalsLineStrong}>
                <Text style={styles.bold}>Total</Text>
                <Text style={styles.bold}>{money(doc.total)}</Text>
              </View>
            </View>
          ) : (
            <View>
              <View style={styles.totalRowBig}>
                <Text style={styles.totalLabel}>TOTAL</Text>
                <Text style={styles.totalValue}>{money(doc.amountPretax)}</Text>
              </View>
              <Text style={styles.hstExtra}>HST extra</Text>
            </View>
          )}
        </View>
      </Page>
    </Document>
  )
}
