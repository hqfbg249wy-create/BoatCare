//
//  SchematicCanvasView.swift
//  Skipily
//
//  SwiftUI-Canvas-Renderer für Schaltpläne. Zeichnet Nodes als Boxen mit
//  System-Icon, Edges als farbige Linien je nach Strom-Art. Pan + Zoom via
//  Magnification- und Drag-Gesten.
//

import SwiftUI

struct SchematicCanvasView: View {
    let schematic: Schematic
    /// IDs, die zusätzlich rot hervorgehoben werden (z. B. aus Validator-Findings).
    var highlightedNodeIDs: Set<String> = []
    var highlightedEdgeIDs: Set<String> = []

    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    @State private var selectedNodeID: String?

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            ZStack {
                Color(.systemGroupedBackground)

                Canvas { context, _ in
                    drawEdges(in: context, size: size)
                } symbols: {}

                ForEach(schematic.nodes) { node in
                    nodeView(node)
                        .position(positionFor(node, in: size))
                        .onTapGesture { selectedNodeID = node.id }
                }
            }
            .scaleEffect(scale)
            .offset(offset)
            .gesture(
                SimultaneousGesture(
                    MagnificationGesture()
                        .onChanged { v in scale = max(0.4, min(3.0, lastScale * v)) }
                        .onEnded { _ in lastScale = scale },
                    DragGesture()
                        .onChanged { v in
                            offset = CGSize(width: lastOffset.width + v.translation.width,
                                            height: lastOffset.height + v.translation.height)
                        }
                        .onEnded { _ in lastOffset = offset }
                )
            )
            .overlay(alignment: .bottomTrailing) { zoomControls }
            .overlay(alignment: .top) { legend }
        }
    }

    // MARK: - Layout

    private func positionFor(_ node: SchematicNode, in size: CGSize) -> CGPoint {
        let padding: CGFloat = 70
        let w = max(size.width - 2 * padding, 100)
        let h = max(size.height - 2 * padding, 100)
        return CGPoint(x: padding + CGFloat(node.x) * w,
                       y: padding + CGFloat(node.y) * h)
    }

    // MARK: - Edge drawing

    private func drawEdges(in context: GraphicsContext, size: CGSize) {
        for edge in schematic.edges {
            guard let from = schematic.node(id: edge.fromNodeID),
                  let to   = schematic.node(id: edge.toNodeID) else { continue }
            let p1 = positionFor(from, in: size)
            let p2 = positionFor(to, in: size)

            var path = Path()
            // L-förmige Manhattan-Route für übersichtliches Layout
            let mid = CGPoint(x: p2.x, y: p1.y)
            path.move(to: p1)
            path.addLine(to: mid)
            path.addLine(to: p2)

            let isHL = highlightedEdgeIDs.contains(edge.id)
            let stroke = isHL ? Color.red : edge.kind.color
            let width: CGFloat = isHL ? 3 : 2
            context.stroke(path, with: .color(stroke), lineWidth: width)

            // Label / Fuse-Marker
            if let amps = edge.fuseAmps, amps > 0 {
                let midpoint = CGPoint(x: (p1.x + mid.x) / 2, y: p1.y)
                let text = Text("\(Int(amps)) A").font(.caption2).foregroundColor(.primary)
                context.draw(text, at: midpoint, anchor: .center)
            } else if let label = edge.label, !label.isEmpty {
                let midpoint = CGPoint(x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - 8)
                context.draw(Text(label).font(.caption2), at: midpoint, anchor: .center)
            }
        }
    }

    // MARK: - Node view

    @ViewBuilder
    private func nodeView(_ node: SchematicNode) -> some View {
        let isHL = highlightedNodeIDs.contains(node.id)
        let isSelected = selectedNodeID == node.id

        VStack(spacing: 4) {
            Image(systemName: node.kind.systemImage)
                .font(.title3)
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
                .background(Circle().fill(color(for: node.kind)))
            Text(node.label)
                .font(.caption2)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 90)
            if isSelected, let spec = specLine(for: node) {
                Text(spec)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                    .frame(maxWidth: 110)
            }
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.08), radius: 2, x: 0, y: 1)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isHL ? Color.red : (isSelected ? Color.accentColor : .clear),
                        lineWidth: isHL || isSelected ? 2 : 0)
        )
    }

    private func color(for kind: SchematicNodeKind) -> Color {
        switch kind {
        case .battery: return .red
        case .shorePower, .inverter, .charger, .dcdcConverter, .alternator, .solarPanel: return .orange
        case .fuse, .breaker, .mainSwitch: return .yellow
        case .busbar, .shunt: return .indigo
        case .pump, .tank, .valve, .filter, .waterMaker: return .blue
        case .light, .fridge, .heater, .windlass, .chartplotter, .load: return .green
        case .junction, .sensor, .other: return .gray
        }
    }

    private func specLine(for node: SchematicNode) -> String? {
        var parts: [String] = []
        if let v = node.voltage { parts.append("\(Int(v)) V") }
        if let a = node.currentAmps { parts.append("\(Int(a)) A") }
        if let w = node.powerWatts { parts.append("\(Int(w)) W") }
        if let c = node.capacity { parts.append("\(Int(c))") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: - Overlays

    private var legend: some View {
        let kinds: [SchematicEdgeKind] = schematic.domain.isElectrical
            ? [.dcPositive, .dcNegative, .acLive, .acNeutral, .acGround]
            : [.pipe, .dataBus, .signal]
        return HStack(spacing: 12) {
            ForEach(kinds, id: \.rawValue) { kind in
                HStack(spacing: 4) {
                    Rectangle().fill(kind.color).frame(width: 14, height: 3)
                    Text(kind.displayName).font(.caption2)
                }
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Capsule().fill(Color(.systemBackground).opacity(0.9)))
        .padding(.top, 8)
    }

    private var zoomControls: some View {
        VStack(spacing: 8) {
            Button { withAnimation { scale = min(3.0, scale + 0.2); lastScale = scale } }
                label: { Image(systemName: "plus.magnifyingglass") }
            Button { withAnimation { scale = max(0.4, scale - 0.2); lastScale = scale } }
                label: { Image(systemName: "minus.magnifyingglass") }
            Button { withAnimation { scale = 1; lastScale = 1; offset = .zero; lastOffset = .zero } }
                label: { Image(systemName: "scope") }
        }
        .font(.title3)
        .padding(8)
        .background(Capsule().fill(Color(.systemBackground).opacity(0.9)))
        .padding(12)
    }
}
