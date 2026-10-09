import { ReactFlow, Background, Controls, MarkerType, Handle, Position } from '@xyflow/react';

const ETIQUETA = {
  disparador: 'Disparador',
  fuente: 'Fuente',
  paso: 'Paso',
  control: 'Control',
  destino: 'Destino',
  orquestador: 'Orquestador',
  entregable: 'Entregable',
};

const TEXTO_CONEXION = { conectada: 'Conectada', desconectada: 'Sin conectar', desconocida: 'Sin revisar' };
const TEXTO_CAMBIO = { agregado: 'Nuevo', quitado: 'Se quita', modificado: 'Cambia' };
const TEXTO_ESTADO = { en_curso: 'En curso…', ok: 'Listo', error: 'Error', omitido: 'Omitido', aviso: 'Aviso' };

function NodoFlujo({ data, selected }) {
  const c = data.corrida;
  const clases = [
    'nodo',
    `nodo-${data.tipo}`,
    data.activo === false ? 'inactivo' : '',
    c ? `corrida-${c.estado}` : '',
    data.cambio ? `cambio-${data.cambio}` : '',
    selected ? 'seleccionado' : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={clases} title={data.detalleConexion || data.detalle || ''}>
      <Handle type="target" id="izq" position={Position.Left} isConnectable={false} />
      <Handle type="target" id="arriba" position={Position.Top} isConnectable={false} />
      <div className="nodo-cabecera">
        <span className="nodo-tipo">{data.numero ? `Paso ${data.numero}` : ETIQUETA[data.tipo]}</span>
        {data.conexion && <span className={`conexion conexion-${data.conexion}`}><i />{TEXTO_CONEXION[data.conexion]}</span>}
        {data.modulo && <span className="chip chip-modulo">Módulo</span>}
        {data.cambio && <span className={`chip chip-cambio-${data.cambio}`}>{TEXTO_CAMBIO[data.cambio]}</span>}
      </div>
      <div className="nodo-titulo">{data.titulo}</div>
      {data.subtitulo && <div className="nodo-sub">{data.subtitulo}</div>}
      {data.tipo === 'control' && data.reglasAprendidas?.length > 0 && (
        <div className="nodo-reglas">{data.reglasAprendidas.length} regla{data.reglasAprendidas.length === 1 ? '' : 's'} aprendida{data.reglasAprendidas.length === 1 ? '' : 's'}</div>
      )}
      {c && (
        <div className={`nodo-corrida estado-${c.estado}`}>
          <i />
          <span>{c.resultado || TEXTO_ESTADO[c.estado]}</span>
        </div>
      )}
      <Handle type="source" id="der" position={Position.Right} isConnectable={false} />
      <Handle type="source" id="abajo" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

const TIPOS = { nodo: NodoFlujo };

export default function Flujo({ grafo, onNodo, alto = 520, clave }) {
  const porId = new Map(grafo.nodes.map((n) => [n.id, n]));
  const aristas = grafo.edges.map((e) => {
    const destino = porId.get(e.target);
    const origen = porId.get(e.source);
    const activa = destino?.data?.corrida?.estado === 'en_curso';
    const recorrida = origen?.data?.corrida?.estado === 'ok' && ['ok', 'en_curso'].includes(destino?.data?.corrida?.estado);
    const apagada = origen?.data?.activo === false || destino?.data?.activo === false;
    return {
      ...e,
      animated: activa,
      className: [e.data?.cambio ? `arista-${e.data.cambio}` : '', activa ? 'arista-activa' : '', recorrida ? 'arista-recorrida' : '', apagada ? 'arista-apagada' : ''].filter(Boolean).join(' '),
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    };
  });
  return (
    <div className="lienzo" style={{ height: alto }}>
      <ReactFlow
        key={clave}
        nodes={grafo.nodes}
        edges={aristas}
        nodeTypes={TIPOS}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        onNodeClick={(_, n) => onNodo?.(n)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.2}
        maxZoom={1.6}
      >
        <Background gap={22} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
