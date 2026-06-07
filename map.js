// ==========================================
// COMPESA - MONITORAMENTO AMBIENTAL MAP LOGIC
// ==========================================

// Inicialização do mapa Leaflet
// Centralizado por padrão em Pernambuco (coordenadas aproximadas do buffer/pontos)
var map = L.map("map", {
  zoomControl: false,
  attributionControl: true
}).setView([-8.28, -35.08], 13);

// Adiciona o controle de zoom no canto superior direito
L.control.zoom({
  position: "topright"
}).addTo(map);

// Camada Satélite (Esri World Imagery)
var esriSatellite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
  }
);

// Camada Mapas de Ruas (OpenStreetMap)
var osmStreets = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }
);

// Adiciona satélite como basemap padrão
esriSatellite.addTo(map);

// Controle de Basemaps no canto superior direito
var baseMaps = {
  "Satélite (Principal)": esriSatellite,
  "Mapa de Ruas (OSM)": osmStreets
};
L.control.layers(baseMaps, {}, { position: "topright" }).addTo(map);

// Variáveis para armazenar as camadas
var bufferLayer;
var pontosLayer;

// Função para retornar a cor correspondente a cada tipo de alteração
function getPointColor(name) {
  var n = String(name || '').trim().toLowerCase();
  if (n.indexOf("construção") >= 0 || n.indexOf("construcao") >= 0) {
    return "#ef4444"; // Vermelho
  }
  if (n.indexOf("supressão") >= 0 || n.indexOf("supressao") >= 0) {
    return "#f97316"; // Laranja
  }
  if (n.indexOf("agricultura") >= 0) {
    return "#eab308"; // Amarelo
  }
  if (n.indexOf("regeneração") >= 0 || n.indexOf("regeneracao") >= 0) {
    return "#10b981"; // Verde
  }
  return "#6366f1"; // Azul/Indigo para Outros
}

// Função para atualizar o painel de detalhes na sidebar
function updateDetailCard(feature, latlng) {
  var detailsContent = document.getElementById("details-content");
  if (!detailsContent) return;

  var props = feature.properties || {};
  var name = props.Name || "Sem Nome";
  var ano = props.ano || "Não Informado";
  var obs = props.obs || "Nenhuma";
  var desc = props.description || "Nenhuma";
  var id = props.id || "N/A";
  
  // Limpa o conteúdo e insere a tabela e o botão
  detailsContent.innerHTML = `
    <table class="detail-table">
      <tr>
        <td class="label-cell">Alteração:</td>
        <td class="value-cell" style="font-weight: 700; color: ${getPointColor(name)};">${name}</td>
      </tr>
      <tr>
        <td class="label-cell">Ano:</td>
        <td class="value-cell">${ano}</td>
      </tr>
      <tr>
        <td class="label-cell">ID:</td>
        <td class="value-cell">${id}</td>
      </tr>
      <tr>
        <td class="label-cell">Observação:</td>
        <td class="value-cell">${obs}</td>
      </tr>
      <tr>
        <td class="label-cell">Descrição:</td>
        <td class="value-cell">${desc}</td>
      </tr>
      <tr>
        <td class="label-cell">Latitude:</td>
        <td class="value-cell">${latlng.lat.toFixed(6)}</td>
      </tr>
      <tr>
        <td class="label-cell">Longitude:</td>
        <td class="value-cell">${latlng.lng.toFixed(6)}</td>
      </tr>
    </table>
    <button type="button" class="zoom-btn" id="zoom-to-point-btn">Focar no Ponto</button>
  `;

  // Listener para o botão de focar no ponto
  var zoomBtn = document.getElementById("zoom-to-point-btn");
  if (zoomBtn) {
    zoomBtn.addEventListener("click", function () {
      map.setView(latlng, 18);
    });
  }
}

// Carregamento do Buffer (Área de Interesse)
fetch("asset/compesa/buffer.geojson")
  .then(function (response) {
    if (!response.ok) {
      throw new Error("Erro ao carregar buffer.geojson");
    }
    return response.json();
  })
  .then(function (data) {
    bufferLayer = L.geoJSON(data, {
      interactive: false, // Permite que cliques passem para os pontos abaixo
      style: function () {
        return {
          color: "#00bcff", // Borda azul clara/cyan
          weight: 2.5,
          fillColor: "#00bcff",
          fillOpacity: 0.15, // Preenchimento semi-transparente
          dashArray: "4, 4"
        };
      }
    }).addTo(map);
    bufferLayer.bringToBack();

    // Ajusta o enquadramento do mapa para englobar todo o buffer
    if (bufferLayer.getBounds().isValid()) {
      map.fitBounds(bufferLayer.getBounds(), { padding: [50, 50] });
    }
  })
  .catch(function (error) {
    console.error("Erro no carregamento do buffer:", error);
  });

// Carregamento dos Pontos de Alterações
fetch("asset/compesa/Pontos_alteracoes.geojson")
  .then(function (response) {
    if (!response.ok) {
      throw new Error("Erro ao carregar Pontos_alteracoes.geojson");
    }
    return response.json();
  })
  .then(function (data) {
    pontosLayer = L.geoJSON(data, {
      pointToLayer: function (feature, latlng) {
        var color = getPointColor(feature.properties.Name);
        return L.circleMarker(latlng, {
          radius: 7,
          fillColor: color,
          color: "#ffffff",
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.85
        });
      },
      onEachFeature: function (feature, layer) {
        var props = feature.properties || {};
        var name = props.Name || "Sem Nome";
        var ano = props.ano || "N/A";
        var obs = props.obs || "Nenhuma";
        var color = getPointColor(name);

        // Pop-up ao passar ou clicar no ponto
        var popupHtml = `
          <div style="font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.4; color: #1e293b;">
            <div style="font-weight: 700; font-size: 13px; color: ${color}; margin-bottom: 4px;">
              ${name}
            </div>
            <hr style="border: 0; border-top: 1px solid rgba(0,0,0,0.1); margin: 6px 0;" />
            <strong>Ano:</strong> ${ano}<br/>
            <strong>Obs:</strong> ${obs}
          </div>
        `;
        layer.bindPopup(popupHtml, {
          closeButton: false,
          offset: L.point(0, -6)
        });

        // Eventos de clique no marcador
        layer.on("click", function () {
          updateDetailCard(feature, layer.getLatLng());
        });

        // Efeito de hover suave
        layer.on("mouseover", function () {
          layer.setRadius(9);
          layer.setStyle({ weight: 2.5 });
          layer.openPopup();
        });
        layer.on("mouseout", function () {
          layer.setRadius(7);
          layer.setStyle({ weight: 1.5 });
        });
      }
    }).addTo(map);
    pontosLayer.bringToFront();
  })
  .catch(function (error) {
    console.error("Erro no carregamento dos pontos de alterações:", error);
  });
