// Muestra los parches de una propuesta con las líneas agregadas y quitadas resaltadas.
export default function Diferencias({ diffs }) {
  if (!diffs?.length) return <p className="tenue">Sin cambios de texto.</p>;
  return (
    <div className="diferencias">
      {diffs.map((d) => (
        <div key={d.archivo} className="diferencia">
          <div className="diferencia-archivo">{d.archivo}</div>
          <pre>
            {d.parche.split('\n').slice(4).map((l, i) => (
              <div key={i} className={l.startsWith('+') ? 'linea-mas' : l.startsWith('-') ? 'linea-menos' : l.startsWith('@@') ? 'linea-bloque' : ''}>{l || ' '}</div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}
