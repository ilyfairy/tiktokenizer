//! Browser bindings. Each provider build owns its own module and WASM memory.
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Encoding {
    inner: &'static tiktoken::CoreBpe,
    name: String,
}

#[wasm_bindgen]
impl Encoding {
    pub fn encode(&self, text: &str) -> Vec<u32> {
        self.inner.encode(text)
    }

    #[wasm_bindgen(js_name = encodeWithSpecialTokens)]
    pub fn encode_with_special_tokens(&self, text: &str) -> Vec<u32> {
        self.inner.encode_with_special_tokens(text)
    }

    pub fn count(&self, text: &str) -> usize {
        self.inner.count(text)
    }

    #[wasm_bindgen(js_name = countWithSpecialTokens)]
    pub fn count_with_special_tokens(&self, text: &str) -> usize {
        self.inner.count_with_special_tokens(text)
    }

    /// Preserve UTF-8 fragments split across token boundaries for highlighting.
    #[wasm_bindgen(js_name = decodeBytes)]
    pub fn decode_bytes(&self, tokens: &[u32]) -> Vec<u8> {
        self.inner.decode(tokens)
    }

    pub fn decode(&self, tokens: &[u32]) -> String {
        String::from_utf8_lossy(&self.inner.decode(tokens)).into_owned()
    }

    #[wasm_bindgen(getter)]
    pub fn name(&self) -> String {
        self.name.clone()
    }

    #[wasm_bindgen(getter, js_name = vocabSize)]
    pub fn vocab_size(&self) -> usize {
        self.inner.vocab_size()
    }

    #[wasm_bindgen(getter, js_name = numSpecialTokens)]
    pub fn num_special_tokens(&self) -> usize {
        self.inner.num_special_tokens()
    }
}

#[wasm_bindgen(js_name = getEncoding)]
pub fn get_encoding(name: &str) -> Result<Encoding, JsValue> {
    tiktoken::get_encoding(name)
        .map(|inner| Encoding { inner, name: name.into() })
        .ok_or_else(|| JsValue::from_str(&format!("Encoding {name} is absent from this provider bundle")))
}

#[wasm_bindgen(js_name = listEncodings)]
pub fn list_encodings() -> Vec<String> {
    tiktoken::list_encodings().iter().map(|name| (*name).into()).collect()
}
