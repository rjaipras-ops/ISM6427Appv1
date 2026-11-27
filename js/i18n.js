// Spanish version of the site. English is the default; the choice is remembered on this device and
// can be set by link (?lang=es / ?lang=en).
//
// How it works: text the site writes itself (buttons, labels, headings, help) is translated as it
// appears on the page, by exact phrase (ES) or by pattern (PATTERNS, for text with numbers or names).
// Listing content from the MLS (descriptions, office names, addresses) and reviews written by users
// are not translated: they're shown exactly as provided (elements marked translate="no" are skipped,
// and only whole phrases in the dictionary are ever replaced).
// Admin pages stay in English.

const KEY = "itoured.lang";

function pickLang() {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "es" || q === "en") { localStorage.setItem(KEY, q); return q; }
    return localStorage.getItem(KEY) === "es" ? "es" : "en";
  } catch { return "en"; }
}
export const LANG = pickLang();
export const isEs = LANG === "es";
export const LOCALE = isEs ? "es-US" : "en-US";

export function setLang(lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* private mode */ }
  const u = new URL(location.href);
  u.searchParams.delete("lang");
  location.replace(u.toString());
}

/* ---------------- dictionary: English (exactly as on the page) -> Spanish ---------------- */
export const ES = {
  // Header, navigation, footer
  "Buy": "Comprar", "Saved homes": "Guardadas", "My tour reviews": "Mis reseñas", "Look up a home": "Buscar una casa",
  "About": "Acerca de", "Search": "Buscar", "Saved": "Guardadas", "My reviews": "Mis reseñas", "Look up": "Buscar casa",
  "Sign in": "Entrar", "Sign out": "Cerrar sesión", "Signed out": "Sesión cerrada", "Account menu": "Menú de la cuenta",
  "About iToured": "Acerca de iToured", "How it works": "Cómo funciona", "FAQ": "Preguntas frecuentes",
  "Homes by city:": "Casas por ciudad:", "Homes by city": "Casas por ciudad", "All cities": "Todas las ciudades", "Cities": "Ciudades",
  "Get the app": "Obtener la app", "📲 Get the iToured app": "📲 Obtener la app de iToured", "Install": "Instalar", "Dismiss": "Cerrar",
  "Contact": "Contacto", "Privacy Policy": "Política de privacidad", "Terms of Service": "Términos del servicio",
  "Privacy policy": "Política de privacidad", "Terms of service": "Términos del servicio", "Privacy": "Privacidad", "Terms": "Términos",
  "Primary": "Principal", "iToured home": "Inicio de iToured", "About the agent and brokerage": "Acerca del agente y la correduría",
  "You're already using the iToured app.": "Ya está usando la app de iToured.",

  // Search bar and filters
  "Search and filters": "Búsqueda y filtros", "City, ZIP or “3 beds, no HOA”": "Ciudad, código postal o “3 habitaciones, sin HOA”",
  "Search by place, or describe what you want, for example 3 beds, no HOA, pool under 500k": "Busque por lugar o describa lo que quiere, por ejemplo: 3 habitaciones, sin HOA, piscina, menos de 500k",
  "For sale": "En venta", "Listing status": "Estado del anuncio", "Active": "Activo", "Under contract / contingent": "Bajo contrato / condicionado",
  "Pending": "Pendiente", "Under contract": "Bajo contrato", "County": "Condado", "Price": "Precio", "Price range": "Rango de precio",
  "Beds & baths": "Habitaciones y baños", "Bedrooms and bathrooms": "Habitaciones y baños", "Bedrooms": "Habitaciones", "Bathrooms": "Baños",
  "Home type": "Tipo de vivienda", "Seller signals": "Señales del vendedor",
  "Price cut from original list price": "Rebaja desde el precio original",
  "Priced below area": "Precio bajo para la zona",
  "price per sq ft 10%+ under the median for its ZIP and home type": "precio por pie² 10 % o más por debajo de la mediana de su código postal y tipo de vivienda",
  "Motivated seller wording": "Lenguaje de vendedor motivado",
  "\"motivated\", \"bring all offers\", \"priced to sell\", \"as is\", \"estate sale\"…": "\"motivated\", \"bring all offers\", \"priced to sell\", \"as is\", \"estate sale\"… (en el anuncio en inglés)",
  "Hide likely overpriced": "Ocultar las probablemente sobrevaloradas",
  "20%+ above the area, 60+ days on market, no price cut": "20 % o más sobre la zona, más de 60 días en el mercado, sin rebaja",
  "Listed within": "Publicadas en los últimos", "Tip: sort by": "Consejo: ordene por", "Biggest price cut": "Mayor rebaja",
  "to see the largest drops first.": "para ver primero las bajadas más grandes.",
  "Commute": "Trayecto", "Commute time": "Tiempo de trayecto", "Work, school or any address": "Trabajo, escuela o cualquier dirección",
  "e.g. Brickell City Centre, Miami": "p. ej. Brickell City Centre, Miami", "Within": "A no más de", "By": "En",
  "Car": "Auto", "Bike": "Bicicleta", "Walking": "A pie", "Show homes": "Ver casas", "Clear": "Borrar",
  "Typical travel times without traffic; rush hour can take much longer. Routing by OpenRouteService.": "Tiempos típicos sin tráfico; en hora pico puede tardar mucho más. Rutas de OpenRouteService.",
  "Filters": "Filtros", "Has tour reviews": "Con reseñas de visitas", "Only show homes with tour reviews": "Mostrar solo casas con reseñas de visitas",
  "Reset": "Restablecer", "Reset all": "Restablecer todo", "See homes": "Ver casas", "Close filters": "Cerrar filtros",
  "Search as I move the map": "Buscar al mover el mapa", "Results": "Resultados", "Map": "Mapa",
  "No min": "Sin mínimo", "No max": "Sin máximo", "Any": "Cualquiera",
  "Monthly payment": "Pago mensual", "Down": "Inicial", "Rate": "Tasa",
  "30-yr loan · includes est. taxes, insurance & HOA": "Préstamo a 30 años · incluye impuestos, seguro y HOA estimados",
  "Home size (sq ft)": "Tamaño de la casa (pies²)", "Lot size": "Tamaño del terreno", "Home age (year built)": "Antigüedad (año de construcción)",
  "Max HOA fee / month": "Cuota máxima de HOA al mes", "Days on market": "Días en el mercado", "Stories": "Pisos", "Garage spaces": "Espacios de garaje",
  "Listing type": "Tipo de anuncio", "Open house this week": "Casa abierta esta semana", "Price reduced": "Precio rebajado",
  "New construction": "Construcción nueva", "Foreclosures": "Ejecuciones hipotecarias", "3D / virtual tour": "Recorrido 3D / virtual",
  "Hide 55+ communities": "Ocultar comunidades 55+", "Features": "Características", "Pool": "Piscina", "Waterfront": "Frente al agua",
  "Ocean access": "Acceso al océano", "Boat dock": "Muelle para bote", "Impact windows": "Ventanas de impacto", "Golf": "Golf",
  "CBS": "CBS (bloque de concreto)", "STR allowed": "Alquiler a corto plazo permitido", "Gated": "Con acceso controlado", "View": "Vista",
  "Fireplace": "Chimenea", "Solar panels": "Paneles solares", "EV charging": "Carga para autos eléctricos", "Tour reviews": "Reseñas de visitas",
  "Minimum tour rating": "Calificación mínima", "3+ stars": "3+ estrellas", "4+ stars": "4+ estrellas", "4.5+ stars": "4.5+ estrellas",
  "Keywords": "Palabras clave", "e.g. new roof, \"hurricane shutters\", seawall": "p. ej. new roof, \"hurricane shutters\", seawall (en inglés)",
  "Ocean access, oceanfront, Intracoastal or no fixed bridges": "Acceso al océano, frente al mar, Intracostero o sin puentes fijos",
  "Concrete block / concrete construction": "Construcción de bloque de concreto", "Short-term rentals allowed": "Se permite alquiler a corto plazo",
  "From the listing's power-production details or description": "Según los datos de energía o la descripción del anuncio",
  "From the listing's parking/electric details or description": "Según los datos de estacionamiento/electricidad o la descripción del anuncio",
  "Close": "Cerrar", "Filter": "Filtrar",

  // Results list
  "South Florida homes for sale": "Casas en venta en el sur de la Florida", "Sort": "Ordenar", "Recommended": "Recomendadas",
  "Newest listings": "Más recientes", "Biggest price cut (%)": "Mayor rebaja (%)", "Price (low to high)": "Precio (de menor a mayor)",
  "Price (high to low)": "Precio (de mayor a menor)", "Price per sq ft": "Precio por pie²", "Largest home": "Casa más grande",
  "Largest lot": "Terreno más grande", "Top tour rating": "Mejor calificación", "Most tour reviews": "Más reseñas",
  "No homes match these filters": "Ninguna casa cumple estos filtros", "Try widening the price range or removing a feature.": "Pruebe a ampliar el rango de precio o quitar una característica.",
  "Clear all filters": "Borrar todos los filtros", "No tour reviews yet": "Aún no hay reseñas de visitas", "bd": "hab", "ba": "baños", "sqft": "pies²", "beds": "hab.", "baths": "baños", "· View all": "· Ver todas", "· Enlarge": "· Ampliar", "bed": "hab.", "bath": "baño",
  "Single Family": "Unifamiliar", "Condo": "Condominio", "Townhouse": "Townhouse", "Multi-Family": "Multifamiliar", "Mobile/Manufactured": "Casa móvil/prefabricada",
  "Land": "Terreno", "Vacant land": "Terreno baldío", "Lot size unclear": "Tamaño del lote no claro",
  "Home reviews from people who walked through": "Reseñas de casas de quienes las recorrieron",
  "iToured is a South Florida home search where the reviews come from buyers who toured the home in person. Listing photos are taken to sell; a tour review tells you what they leave out, like water staining, road noise, deferred maintenance or a floor plan that feels different once you're inside.":
    "iToured es un buscador de casas del sur de la Florida donde las reseñas vienen de compradores que visitaron la casa en persona. Las fotos del anuncio están hechas para vender; una reseña de visita le cuenta lo que no muestran, como manchas de humedad, ruido de la calle, mantenimiento atrasado o una distribución que se siente distinta por dentro.",
  "Search homes for sale across Miami-Dade, Broward and Palm Beach counties, read what touring buyers noticed, and add your own review after a showing or open house. Every reviewer certifies they toured the home and has no connection to the seller.":
    "Busque casas en venta en los condados de Miami-Dade, Broward y Palm Beach, lea lo que notaron otros compradores en sus visitas y agregue su propia reseña después de una visita o casa abierta. Cada persona que escribe una reseña certifica que visitó la casa y que no tiene relación con el vendedor.",
  "Tour reviews are opinions of signed-in users who certify they toured the home; they are not verified by the listing broker or BeachesMLS.":
    "Las reseñas son opiniones de usuarios registrados que certifican haber visitado la casa; no las verifica el corredor del anuncio ni BeachesMLS.",
  "iToured is a home search where buyers who toured a home share what the listing doesn't tell you. Listings are provided by BeachesMLS.":
    "iToured es un buscador de casas donde los compradores que visitaron una casa cuentan lo que el anuncio no dice. Los anuncios los proporciona BeachesMLS.",
  "Sample data (test mode).": "Datos de muestra (modo de prueba).",

  // Listing page
  "Back to search": "Volver a la búsqueda", "← Back to search": "← Volver a la búsqueda", "← Back": "← Volver", "Listing photos": "Fotos del anuncio",
  "About this home": "Acerca de esta casa", "Key facts": "Datos clave", "Property type": "Tipo de propiedad", "Year built": "Año de construcción",
  "Price / sqft": "Precio / pie²", "HOA": "HOA", "Garage": "Garaje", "Days listed": "Días publicada", "Annual taxes (per listing)": "Impuestos anuales (según el anuncio)",
  "Style": "Estilo", "None listed": "No indicado", "None": "Ninguno", "Not listed": "No indicado", "Neighborhood": "Vecindario",
  "Construction": "Construcción", "Roof": "Techo", "Foundation": "Cimientos", "Windows": "Ventanas", "Storm protection": "Protección contra tormentas",
  "Want to see it in person?": "¿Quiere verla en persona?",
  "Request a tour and a licensed local agent will reach out, usually within the hour. After you tour, come back and leave a verified review.":
    "Solicite una visita y un agente local con licencia se comunicará con usted, normalmente en menos de una hora. Después de la visita, vuelva y deje una reseña verificada.",
  "Request a tour": "Solicitar una visita", "Toured it? Write a review": "¿La visitó? Escriba una reseña", "Write a tour review": "Escribir una reseña",
  "Tour it, then come back to review it": "Visítela y luego vuelva para reseñarla",
  "Listing information provided by BeachesMLS through IDX. Listing courtesy of": "Información del anuncio proporcionada por BeachesMLS mediante IDX. Anuncio cortesía de",
  "Listing courtesy of": "Anuncio cortesía de", "Listed by": "Publicado por", "Listing provided by BeachesMLS": "Anuncio proporcionado por BeachesMLS",
  "Calculated by iToured from the listing's prices and other active listings nearby": "Calculado por iToured con los precios del anuncio y otros anuncios activos cercanos",
  "View photos ↗": "Ver fotos ↗", "Satellite": "Satélite", "Street map": "Mapa de calles", "Satellite view of the property": "Vista satelital de la propiedad",
  "Satellite view of the neighborhood": "Vista satelital del vecindario", "Previous": "Anterior", "Next": "Siguiente",

  // Public records, flood, solar, calculator
  "Public records & taxes": "Registros públicos e impuestos", "County property records · not from BeachesMLS": "Registros de propiedad del condado · no provienen de BeachesMLS",
  "Parcel ID": "Número de parcela", "Land use": "Uso del suelo", "Market (just) value": "Valor de mercado (just value)", "Assessed value": "Valor tasado",
  "Taxable value": "Valor imponible", "Land value": "Valor del terreno", "Homestead exemption": "Exención homestead (vivienda principal)",
  "Year built (actual / effective)": "Año de construcción (real / efectivo)", "Living area (county)": "Área habitable (condado)",
  "Owner of record": "Propietario registrado", "Last sale": "Última venta", "Prior sale": "Venta anterior", "Sale history": "Historial de ventas",
  "Current owner's taxes": "Impuestos del dueño actual", "Est. taxes after you buy": "Impuestos estimados después de comprar",
  "Tax bills & payment status ↗": "Facturas de impuestos y estado de pago ↗", "Owner & full property record ↗": "Propietario y registro completo ↗",
  "Search the property appraiser ↗": "Buscar en el tasador de propiedades ↗", "Parcel number copied": "Número de parcela copiado",
  "Parcel number from the MLS listing.": "Número de parcela según el anuncio del MLS.",
  "The state's statewide parcel data doesn't list this unit separately, so its values and tax estimate aren't shown here. The county's own records for this unit:":
    "Los datos estatales de parcelas no listan esta unidad por separado, así que sus valores y el estimado de impuestos no se muestran aquí. Los registros del condado para esta unidad:",
  "County records are slow right now. Still trying…": "Los registros del condado están lentos ahora mismo. Seguimos intentando…",
  "Flood & elevation": "Inundación y elevación", "Ground elevation": "Elevación del terreno", "Flood zone (from the listing)": "Zona de inundación (según el anuncio)",
  "Not stated in the listing": "No indicada en el anuncio", "Not available": "No disponible", "Loading…": "Cargando…",
  "Elevation is the ground at the home's map location (NAVD88), not the floor height. Flood insurance depends on the FEMA flood zone and the home's elevation certificate, so ask the seller for the certificate.":
    "La elevación es la del terreno en la ubicación de la casa en el mapa (NAVD88), no la altura del piso. El seguro contra inundaciones depende de la zona de inundación de FEMA y del certificado de elevación de la casa, así que pida el certificado al vendedor.",
  "FEMA flood map for this address ↗": "Mapa de inundación de FEMA para esta dirección ↗", "Flood zone": "Zona de inundación", "Flood insurance": "Seguro contra inundaciones",
  "Solar potential": "Potencial solar", "Sunshine on the roof": "Sol sobre el techo", "Room for": "Espacio para", "A typical system here": "Un sistema típico aquí",
  "Monthly cost estimate": "Costo mensual estimado", "Down payment (%)": "Pago inicial (%)", "Interest rate (%)": "Tasa de interés (%)", "Loan term (yrs)": "Plazo del préstamo (años)",
  "Principal & interest": "Capital e intereses", "Property tax": "Impuesto a la propiedad", "Home insurance": "Seguro de la vivienda",

  // Reviews
  "No reviews yet": "Aún no hay reseñas", "No tour reviews yet.": "Aún no hay reseñas de visitas.",
  "No reviews yet. Reviews can only be written by signed-in users who certify they toured the home in person.":
    "Aún no hay reseñas. Solo pueden escribirlas usuarios registrados que certifiquen haber visitado la casa en persona.",
  "Tour reviews are opinions of iToured users, not information from BeachesMLS or the listing broker.":
    "Las reseñas de visitas son opiniones de usuarios de iToured, no información de BeachesMLS ni del corredor del anuncio.",
  "Review your tour": "Reseñe su visita", "Date you toured": "Fecha de la visita", "How you toured": "Cómo la visitó", "Headline": "Titular",
  "e.g. Exactly like the photos, but the street is busy": "p. ej. Igual que en las fotos, pero la calle es transitada",
  "Your tour, in detail": "Su visita, en detalle", "Not sure what to write? Things buyers only learn in person:": "¿No sabe qué escribir? Cosas que solo se descubren en persona:",
  "Visible moisture staining, or signs of previous water damage": "Manchas de humedad visibles o señales de daños por agua",
  "Road noise, or a busier street than you expected": "Ruido de tráfico o una calle más transitada de lo esperado",
  "Poor workmanship or signs of deferred maintenance": "Trabajos mal hechos o señales de mantenimiento atrasado",
  "An awkward floor plan that the photos hide": "Una distribución incómoda que las fotos esconden",
  "Positive surprises, like better natural light or a quieter neighborhood than expected": "Sorpresas positivas, como más luz natural o un vecindario más tranquilo de lo esperado",
  "Describe the home and street, not the people who live nearby.": "Describa la casa y la calle, no a las personas que viven cerca.",
  "What you liked": "Lo que le gustó", "Watch out for": "Tenga en cuenta", "Liked": "Le gustó", "Liked:": "Le gustó:", "Watch out for:": "Tenga en cuenta:",
  "I certify that I personally toured": "Certifico que visité personalmente",
  "in person on the date above, that this review reflects my own experience, and that I am not the owner, listing agent, or affiliated with the seller.":
    "en persona en la fecha indicada, que esta reseña refleja mi propia experiencia y que no soy el propietario, el agente del anuncio ni tengo relación con el vendedor.",
  "Post review": "Publicar reseña", "Report": "Reportar", "Delete": "Eliminar", "Review deleted": "Reseña eliminada",
  "Thanks for the feedback": "Gracias por su opinión", "You already marked this helpful": "Ya marcó esta reseña como útil",
  "You've already reviewed this home.": "Ya reseñó esta casa.", "Earlier tour": "Visita anterior",
  "The reviewer certified they toured this home in person": "La persona certificó que visitó esta casa en persona",
  "This review was written when the home was listed earlier, or from Look up a home. Its condition may have changed since.":
    "Esta reseña se escribió cuando la casa estuvo publicada antes, o desde Buscar una casa. Su estado puede haber cambiado desde entonces.",
  "Only you can see this for now: it will appear after a quick check.": "Por ahora solo usted la ve: aparecerá después de una revisión rápida.",
  "Reviews are turned off for this home at the seller's request.": "Las reseñas están desactivadas para esta casa a pedido del vendedor.",
  "Reviews are turned off for this listing at the seller's request.": "Las reseñas están desactivadas para este anuncio a pedido del vendedor.",
  "Report this review": "Reportar esta reseña", "Tell us what's wrong. Reviews with several reports are hidden until we check them.":
    "Cuéntenos qué está mal. Las reseñas con varios reportes se ocultan hasta que las revisemos.",
  "Details (optional)": "Detalles (opcional)", "Send report": "Enviar reporte",
  "Only signed-in users who certify they toured a home can review it.": "Solo los usuarios registrados que certifiquen haber visitado una casa pueden reseñarla.",

  // Sign-in
  "Sign in to iToured": "Iniciar sesión en iToured", "Post reviews of homes you've toured and keep track of them.": "Publique reseñas de las casas que visitó y lleve un registro de ellas.",
  "Name shown on reviews": "Nombre que aparece en las reseñas", "Email": "Correo electrónico", "Cancel": "Cancelar", "Continue": "Continuar",
  "Reviews show your first name and last initial. Your email is never shown publicly.": "Las reseñas muestran su nombre y la inicial de su apellido. Su correo nunca se muestra públicamente.",
  "Loading Google sign-in…": "Cargando el inicio de sesión de Google…", "Sign in to see your reviews": "Inicie sesión para ver sus reseñas",

  // Tour request form (consent must match what's recorded with the request)
  "A licensed local agent will reach out, usually within the hour.": "Un agente local con licencia se comunicará con usted, normalmente en menos de una hora.",
  "Your name": "Su nombre", "Mobile phone": "Teléfono celular", "Enter a 10-digit phone number": "Ingrese un número de teléfono de 10 dígitos",
  "When are you hoping to buy?": "¿Cuándo espera comprar?", "Choose…": "Elija…", "Within 3 months": "En menos de 3 meses", "3–6 months": "3 a 6 meses",
  "6–12 months": "6 a 12 meses", "Just browsing": "Solo estoy mirando", "Financing": "Financiamiento", "Pre-approved": "Preaprobado/a",
  "Paying cash": "Pago en efectivo", "Not yet pre-approved": "Aún sin preaprobación",
  "Are you already working with a real estate agent?": "¿Ya trabaja con un agente inmobiliario?", "No": "No", "Yes": "Sí",
  "Thanks! Please contact your own agent to tour this home; they can schedule it for you.": "¡Gracias! Comuníquese con su propio agente para visitar esta casa; él o ella puede programarla.",
  "Message (optional)": "Mensaje (opcional)", "Send request": "Enviar solicitud", "Leave this empty": "Deje esto vacío",
  "I agree that LoKation Real Estate, or a licensed agent it refers me to, may contact me about this request by phone, text (including automated texts) or email. Consent isn't required to buy anything. Message and data rates may apply; reply STOP to opt out.":
    "Acepto que LoKation Real Estate, o un agente con licencia al que me refiera, se comunique conmigo sobre esta solicitud por teléfono, mensaje de texto (incluidos mensajes automatizados) o correo electrónico. Este consentimiento no es necesario para comprar. Pueden aplicarse cargos por mensajes y datos; responda STOP para dejar de recibir mensajes.",
  "If you're referred to another agent, LoKation may receive a referral fee. It doesn't change what you pay.":
    "Si se le refiere a otro agente, LoKation puede recibir una comisión por referido. Eso no cambia lo que usted paga.",
  "Thanks! A local agent will be in touch soon.": "¡Gracias! Un agente local se comunicará con usted pronto.",

  // Look up, saved, misc
  "Look up any home": "Busque cualquier casa", "Find a home": "Buscar una casa", "e.g. 1020 SE 9th Ave, Fort Lauderdale": "p. ej. 1020 SE 9th Ave, Fort Lauderdale",
  "See tour reviews, property taxes, sale history and county records for any home, whether it's for sale or not. Toured a home? You can review it here too.":
    "Vea reseñas de visitas, impuestos, historial de ventas y registros del condado de cualquier casa, esté en venta o no. ¿Visitó una casa? También puede reseñarla aquí.",
  "← Look up another home": "← Buscar otra casa", "Which unit?": "¿Qué unidad?", "See the full iToured listing ↗": "Ver el anuncio completo en iToured ↗",
  "Nothing saved yet": "Aún no hay nada guardado", "Tap the heart on any home to keep it here.": "Toque el corazón en cualquier casa para guardarla aquí.",
  "Browse homes": "Ver casas", "Open a home you've toured and choose “I toured this home”.": "Abra una casa que visitó y elija “Visité esta casa”.",
  "That home is no longer available.": "Esa casa ya no está disponible.", "This home is no longer available.": "Esta casa ya no está disponible.",
  "It went off-market, so it's been removed from search.": "Salió del mercado, así que se quitó de la búsqueda.",
  "Enter an amount like 450k, $1.2M or 3,000": "Ingrese una cantidad como 450k, $1.2M o 3,000", "Couldn't load listings": "No se pudieron cargar los anuncios",
  "Reading your request…": "Leyendo su búsqueda…", "Searching for:": "Buscando:", "Couldn't apply:": "No se pudo aplicar:",
  "No homes matched everything, so these were left out:": "Ninguna casa cumplía todo, así que se omitió:",
  "iToured can't search by who lives in an area or by how safe it is. Try home features, price and location instead.":
    "iToured no busca según quién vive en una zona ni según su seguridad. Pruebe con características, precio y ubicación.",
  "Save home": "Guardar casa", "Remove from saved": "Quitar de guardadas", "View all photos full screen": "Ver todas las fotos en pantalla completa",
  "Toured this home? Share what the listing doesn't tell you.": "¿Visitó esta casa? Cuente lo que el anuncio no dice.",
  "Thanks — you've reviewed this home.": "Gracias, ya reseñó esta casa.", "I toured this home": "Visité esta casa", "View your review": "Ver su reseña",
  "Annual taxes per the listing": "Impuestos anuales según el anuncio", "Estimate from county taxable value": "Estimado según el valor imponible del condado",
  "Certified tour": "Visita certificada", "Sample": "Muestra", "Helpful": "Útil",
  "Open house": "Casa abierta", "Status": "Estado", "Type": "Tipo", "Updated": "Actualizado", "Map unavailable.": "Mapa no disponible.",
};

// Text with numbers or names in it: [pattern, replacement]. Applied to whole text pieces only.
export const PATTERNS = [
  [/^([\d,]+) homes?$/, "$1 casas"],
  [/^Est\. (\$[\d,]+)\/mo$/, "Est. $1/mes"],
  [/^(\$[\d,]+)\/mo$/, "$1/mes"],
  [/^(\$[\d,]+)\/yr$/, "$1/año"],
  [/^New · (\d+)d$/, "Nuevo · $1 d"],
  [/^(\d+)% below area$/, "$1 % bajo la zona"],
  [/^(\d+)% above area$/, "$1 % sobre la zona"],
  [/^Courtesy of (.+)$/, "Cortesía de $1"],
  [/^(\d+) days on market$/, "$1 días en el mercado"],
  [/^Unclear\. The listing says ([\d,.]+) acres, which doesn't fit the price \(likely an entry error\)\. Check the county record on this page, or ask the listing agent\.$/,
    "No está claro. El anuncio indica $1 acres, lo que no corresponde al precio (probablemente un error de captura). Consulte el registro del condado en esta página o pregunte al agente del anuncio."],
  [/^([\d.]+) acres \(([\d,]+) sqft\)$/, "$1 acres ($2 pies²)"],
  [/^(\d+)\+ beds$/, "$1+ hab."],
  [/^(\d+)\+ baths$/, "$1+ baños"],
  [/^(\d+)\+ bd$/, "$1+ hab."],
  [/^(\d+)\+ ba$/, "$1+ baños"],
  [/^≤ (\d+) min drive$/, "≤ $1 min en auto"],
  [/^≤ (\d+) min bike ride$/, "≤ $1 min en bicicleta"],
  [/^≤ (\d+) min walk$/, "≤ $1 min a pie"],
  [/^≤ (\d+) min drive to (.+)$/, "≤ $1 min en auto a $2"],
  [/^≤ (\d+) min bike ride to (.+)$/, "≤ $1 min en bicicleta a $2"],
  [/^≤ (\d+) min walk to (.+)$/, "≤ $1 min a pie a $2"],
  [/^(\d+) photos?$/, "$1 fotos"],
  [/^(\d+) \/ (\d+) · View all$/, "$1 / $2 · Ver todas"],
  [/^Toured (.+) · (.+) · Posted (.+)$/, "Visitada el $1 · $2 · Publicada el $3"],
  [/^👍 Helpful( \(\d+\))?$/, "👍 Útil$1"],
  [/^Last (\d+) days$/, "Últimos $1 días"],
  [/^About (\d+) ft above sea level$/, "Unos $1 pies sobre el nivel del mar"],
  [/^· listing says ([\d,]+)$/, "· el anuncio dice $1"],
  [/^About (\$[\d,]+)\/yr if it's your primary home \(homestead\)$/, "Unos $1/año si es su vivienda principal (homestead)"],
  [/^(\d{4}) county tax bill$/, "Factura de impuestos del condado de $1"],
  [/^(.+) · (with|no) homestead exemption$/, (m, note, w) => `${translate(note) ?? note} · ${w === "with" ? "con exención homestead" : "sin exención homestead"}`],
  [/^Rate: this week's average 30-year fixed rate, ([\d.]+)% \(Freddie Mac, week of (.+)\)\. Your rate depends on your credit and loan\.$/,
    "Tasa: el promedio de esta semana para una hipoteca fija a 30 años, $1 % (Freddie Mac, semana del $2). Su tasa depende de su crédito y del préstamo."],
  [/^Seller signals \((\d+)\)$/, "Señales del vendedor ($1)"],
  [/^Home type \((\d+)\)$/, "Tipo de vivienda ($1)"],
  [/^(\d+) counties$/, "$1 condados"],
  [/^(.+) County$/, "Condado de $1"],
];

/** Spanish for a piece of text the site wrote itself, or null if there's none. */
export function translate(text) {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (ES[t] != null) return ES[t];
  for (const [re, rep] of PATTERNS) if (re.test(t)) return t.replace(re, rep);
  return null;
}

/** Translates the text and labels under `root` (in place), skipping translate="no" content. */
export function translateTree(root) {
  if (!isEs || !root) return;
  const skip = (el) => el && el.closest && el.closest('[translate="no"], script, style, textarea, .admin-wrap, #view-admin');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const n of nodes) {
    if (skip(n.parentElement)) continue;
    const es = translate(n.nodeValue);
    // Only when it changes: words spelled the same in both languages ("No", "HOA") would loop.
    if (es != null && es !== n.nodeValue.trim()) n.nodeValue = n.nodeValue.replace(/\S[\s\S]*\S|\S/, es);
  }
  const els = root.querySelectorAll ? [root, ...root.querySelectorAll("[placeholder],[aria-label],[title],option")] : [];
  for (const el of els) {
    if (!el.getAttribute || skip(el)) continue;
    for (const a of ["placeholder", "aria-label", "title"]) {
      const v = el.getAttribute(a);
      const es = v && translate(v);
      if (es != null && es !== v) el.setAttribute(a, es);
    }
  }
}

/** Translates the page now and everything the app adds later. */
export function startTranslating() {
  if (!isEs) return;
  document.documentElement.lang = "es";
  translateTree(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") { translateTree(m.target.parentElement || m.target); continue; }
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) translateTree(n);
        else if (n.nodeType === 3 && n.parentElement) translateTree(n.parentElement);
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
