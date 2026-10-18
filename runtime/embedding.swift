import Foundation
import NaturalLanguage
let model = NLEmbedding.sentenceEmbedding(for: .english)
while let line = readLine() {
    autoreleasepool {
        do {
            guard let model = model else { throw NSError(domain: "embedding-unavailable", code: 1) }
            guard let data=line.data(using:.utf8), let input=try JSONSerialization.jsonObject(with:data) as? [String:Any], let texts=input["texts"] as? [String], texts.count<=32 else { throw NSError(domain:"invalid-request",code:1) }
            let vectors:[Any]=texts.map { text in model.vector(for:String(text.prefix(2000))) as Any? ?? NSNull() }
            let output:[String:Any] = ["model":"apple-nl-sentence-en-r\(model.revision)-d\(model.dimension)","dimension":model.dimension,"vectors":vectors]
            let encoded=try JSONSerialization.data(withJSONObject:output)
            print(String(data:encoded,encoding:.utf8)!)
        } catch { print("{\"error\":\"Local sentence embedding unavailable\"}") }
        fflush(stdout)
    }
}
