# COMPESA - APP

Este projeto é uma aplicação web desenvolvida com HTML, CSS e JavaScript para visualizar dados geoespaciais de interesse ambiental. O sistema permite a visualização de satélites (Esri World Imagery) e mapas de ruas (OpenStreetMap), destacando uma área de interesse (buffer) e pontos específicos de alterações ambientais, como construções e supressões de vegetação.

## 📋 Funcionalidades

- **Visualização de Mapa**: Basemaps de satélite (Esri World Imagery) e mapa de ruas (OpenStreetMap) com troca de camadas.
- **Área de Interesse (Buffer)**: Visualização de uma área buffer (polígono) com bordas tracejadas azuis e preenchimento semi-transparente.
- **Pontos de Alteração**: Marcação de pontos com diferentes cores baseadas no tipo de alteração:
  - **Vermelho**: Construção
  - **Laranja**: Supressão
  - **Amarelo**: Agricultura
  - **Verde**: Regeneração
  - **Azul/Índigo**: Outros
- **Interatividade**: Efeitos de hover nos pontos e pop-ups informativos.
- **Painel de Detalhes**: Sidebar para exibir informações detalhadas sobre o ponto selecionado (Nome, Ano, Observação, Descrição, Latitude, Longitude) e botão para focar no ponto.

## 🚀 Instalação e Execução

### Pré-requisitos

- Node.js (versão 14 ou superior)
- npm (gerenciador de pacotes do Node.js)

### Instalação

1. Clone o repositório ou baixe os arquivos do projeto.
2. Navegue até o diretório raiz do projeto no terminal:
   ```bash
   cd path/to/your-project
   ```
3. Instale as dependências necessárias:
   ```bash
   npm install
   ```

### Execução

1. Inicie o servidor local:
   ```bash
   npm start
   ```
2. Abra o navegador e acesse: `http://localhost:5501`

## 📂 Estrutura do Projeto

```
.
├── asset/
│   └── compesa/
│       ├── buffer.geojson
│       └── Pontos_alteracoes.geojson
├── css/
│   └── style.css
├── js/
│   └── map.js
└── index.html
```

### Arquivos Principais

- `index.html`: Estrutura da aplicação e inicialização do mapa.
- `js/map.js`: Lógica principal do mapa, carregamento de dados e interatividade.
- `css/style.css`: Estilos da aplicação e do mapa.
- `asset/compesa/`: Contém os arquivos geoJSON com os dados do buffer e dos pontos.

## 🛠️ Detalhes Técnicos

### Dependências

O projeto utiliza as seguintes bibliotecas:

- **Leaflet**: Biblioteca JavaScript para mapas interativos. (Incluído via CDN no HTML)

### Formato dos Dados GeoJSON

- **buffer.geojson**: Um arquivo GeoJSON do tipo `Polygon` definindo a área de interesse.
- **Pontos_alteracoes.geojson**: Um arquivo GeoJSON do tipo `MultiPoint` contendo os pontos de alteração com propriedades como `Name`, `ano`, `obs`, `description` e `id`.
