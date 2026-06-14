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
    paddingTop: 0,
    paddingBottom: 64,
    paddingHorizontal: 0,
    fontSize: 10.5,
    fontFamily: "Helvetica",
    color: "#18181b",
    lineHeight: 1.45,
  },
  accent: { height: 6 },
  body: { paddingHorizontal: 44, paddingTop: 32 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  companyName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  muted: { color: "#71717a" },
  small: { fontSize: 8.5, color: "#a1a1aa" },
  rightCol: { textAlign: "right" },
  eyebrow: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
  },
  estimateNo: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
  divider: { borderTopWidth: 1, borderTopColor: "#e4e4e7", marginTop: 18, paddingTop: 14 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontSize: 8, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 1 },
  recipientName: { fontFamily: "Helvetica-Bold", marginTop: 2 },
  section: { marginTop: 18 },
  areaName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bulletRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 2 },
  dot: { width: 10 },
  bulletText: { flex: 1 },
  notes: { marginTop: 18, backgroundColor: "#f4f4f5", borderRadius: 6, padding: 12 },
  notesTitle: { fontSize: 8, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
  totalsWrap: { marginTop: 22, borderTopWidth: 1, borderTopColor: "#e4e4e7", paddingTop: 14 },
  totalsTable: { marginLeft: "auto", width: 220 },
  totalsLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  totalBig: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: 2, paddingTop: 6 },
  totalLabel: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  hstExtra: { fontSize: 8.5, color: "#71717a", textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  terms: { flexDirection: "row", flexWrap: "wrap", marginTop: 18 },
  term: { fontSize: 8.5, color: "#71717a", marginRight: 18 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    paddingHorizontal: 44,
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  footerText: { fontSize: 8.5, color: "#ffffff", marginHorizontal: 4 },
  footerName: { fontSize: 8.5, color: "#ffffff", fontFamily: "Helvetica-Bold", marginHorizontal: 4 },
})

export function QuotePdfDocument({ doc }: { doc: QuoteDoc }) {
  const brand = doc.company.brandColor || "#C49A2C"

  return (
    <Document title={`Estimate ${doc.quoteNumber}`} author={doc.company.name}>
      <Page size="LETTER" style={styles.page}>
        <View style={[styles.accent, { backgroundColor: brand }]} />

        <View style={styles.body}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.companyName}>{doc.company.name}</Text>
              {doc.company.ownerName ? (
                <Text style={styles.muted}>{doc.company.ownerName}</Text>
              ) : null}
              <Text style={styles.muted}>Master Electrician</Text>
              {doc.company.licenseNumber ? (
                <Text style={styles.small}>ECRA/ESA {doc.company.licenseNumber}</Text>
              ) : null}
            </View>
            <View style={styles.rightCol}>
              <Text style={[styles.eyebrow, { color: brand }]}>ESTIMATE</Text>
              <Text style={styles.estimateNo}>{doc.quoteNumber}</Text>
              <Text style={[styles.small, { marginTop: 4 }]}>Date: {doc.date}</Text>
              <Text style={styles.small}>Valid until: {doc.validUntil}</Text>
            </View>
          </View>

          {/* Prepared for / site */}
          <View style={[styles.divider, styles.metaRow]}>
            {doc.client ? (
              <View>
                <Text style={styles.label}>Prepared for</Text>
                <Text style={styles.recipientName}>{doc.client.name}</Text>
                {doc.client.address ? (
                  <Text style={styles.muted}>{doc.client.address}</Text>
                ) : null}
              </View>
            ) : (
              <View />
            )}
            {doc.siteAddress ? (
              <View style={styles.rightCol}>
                <Text style={styles.label}>Project site</Text>
                <Text style={{ marginTop: 2 }}>{doc.siteAddress}</Text>
              </View>
            ) : null}
          </View>

          {/* Intro */}
          <View style={styles.section}>
            <Text>{doc.intro}</Text>
          </View>

          {/* Scope */}
          <View style={styles.section}>
            {doc.areas.map((area, i) => (
              <View key={i} style={{ marginBottom: 12 }} wrap={false}>
                <Text style={[styles.areaName, { color: brand }]}>{area.name}</Text>
                {area.bullets.map((b, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={[styles.dot, { color: brand }]}>•</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>

          {/* Notes */}
          {doc.notes ? (
            <View style={styles.notes}>
              <Text style={styles.notesTitle}>Notes</Text>
              <Text>{doc.notes}</Text>
            </View>
          ) : null}

          {/* Totals */}
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
                <View style={[styles.totalBig, { borderTopColor: brand }]}>
                  <Text style={styles.bold}>Total</Text>
                  <Text style={styles.bold}>{money(doc.total)}</Text>
                </View>
              </View>
            ) : (
              <View style={[styles.totalBig, { borderTopColor: brand }]}>
                <Text style={styles.totalLabel}>TOTAL</Text>
                <View style={styles.rightCol}>
                  <Text style={[styles.totalValue, { color: brand }]}>
                    {money(doc.amountPretax)}
                  </Text>
                  <Text style={styles.hstExtra}>+ HST</Text>
                </View>
              </View>
            )}
          </View>

          {/* Terms */}
          <View style={styles.terms}>
            <Text style={styles.term}>Valid until {doc.validUntil}</Text>
            <Text style={styles.term}>Payment terms: Net {doc.netDays} days</Text>
            <Text style={styles.term}>Prices in CAD.</Text>
          </View>
        </View>

        {/* Footer band (fixed) */}
        <View fixed style={[styles.footer, { backgroundColor: brand }]}>
          <Text style={styles.footerName}>{doc.company.name}</Text>
          {doc.company.phone ? (
            <Text style={styles.footerText}>· {doc.company.phone}</Text>
          ) : null}
          {doc.company.email ? (
            <Text style={styles.footerText}>· {doc.company.email}</Text>
          ) : null}
          {doc.company.licenseNumber ? (
            <Text style={styles.footerText}>· ECRA/ESA {doc.company.licenseNumber}</Text>
          ) : null}
        </View>
      </Page>
    </Document>
  )
}
