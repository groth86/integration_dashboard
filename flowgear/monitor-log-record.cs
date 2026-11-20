// Flowgear V1 "Script" node for the sub-workflow "Monitor - Log Record".
// Posts ONE record outcome to the Integration Monitor dashboard:
//   POST {Url}  (e.g. https://YOUR-SITE/api/recordimport/fromflowgear)
//   Authorization: Bearer {Token}   (= FLOWGEAR_IMPORT_BEARER_TOKEN in Vercel)
//
// It NEVER throws: any failure is returned as text starting "FAILED", so a
// dashboard outage can never break the integration that calls it.
//
// Custom properties to add on the Script node (all inputs):
//   Url, Token, AccountName, IntegrationType, RecordId, OrderReference,
//   WorkflowName, Direction, SystemName, Status, ResponseCode,
//   ResponseDescription, RequestPayload, ResponsePayload
// If ResponseDescription is blank it is worked out from ResponsePayload
// (CloudX validation "errors", Shopify "userErrors", "title"/"message").
//
// C# 5 only (Flowgear V1 compiler): no $"", ?. or other newer syntax.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CSharpScript
{
    public partial class Processor
    {
        public object Process()
        {
            try
            {
                string code = S(ResponseCode);
                string responseBody = S(ResponsePayload);
                string description = S(ResponseDescription);
                if (description == "") description = Describe(responseBody, code);

                JObject record = new JObject();
                record["accountName"] = S(AccountName);
                record["integrationType"] = S(IntegrationType);
                record["recordId"] = S(RecordId);
                record["orderReference"] = S(OrderReference);
                record["workflow"] = S(WorkflowName);
                record["direction"] = S(Direction);
                record["system"] = S(SystemName);
                record["status"] = S(Status);
                record["responseCode"] = code;
                record["responseDescription"] = description;
                record["requestPayload"] = S(RequestPayload);
                record["responsePayload"] = responseBody;
                record["timestamp"] = DateTime.UtcNow.ToString("o");

                // TLS 1.2 (3072) is required by the dashboard host.
                ServicePointManager.SecurityProtocol = ServicePointManager.SecurityProtocol | (SecurityProtocolType)3072;

                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(S(Url));
                req.Method = "POST";
                req.ContentType = "application/json";
                req.Headers["Authorization"] = "Bearer " + S(Token);
                req.Timeout = 15000; // ms: never hold up the calling integration for long

                byte[] body = Encoding.UTF8.GetBytes(record.ToString(Formatting.None));
                req.ContentLength = body.Length;
                using (Stream s = req.GetRequestStream())
                {
                    s.Write(body, 0, body.Length);
                }
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader r = new StreamReader(resp.GetResponseStream()))
                {
                    return ((int)resp.StatusCode).ToString() + " " + r.ReadToEnd();
                }
            }
            catch (WebException ex)
            {
                HttpWebResponse er = ex.Response as HttpWebResponse;
                if (er != null)
                {
                    using (StreamReader r = new StreamReader(er.GetResponseStream()))
                    {
                        return "FAILED " + ((int)er.StatusCode).ToString() + " " + r.ReadToEnd();
                    }
                }
                return "FAILED " + ex.Message;
            }
            catch (Exception ex)
            {
                return "FAILED " + ex.Message;
            }
        }

        static string S(object o)
        {
            return o == null ? "" : o.ToString().Trim();
        }

        // Short human-readable reason taken from a JSON response body.
        static string Describe(string body, string code)
        {
            if (body != "")
            {
                try
                {
                    JObject o = JToken.Parse(body) as JObject;
                    if (o != null)
                    {
                        List<string> msgs = new List<string>();
                        // CloudX / ASP.NET validation: "errors": { "Field": ["msg", ...] }
                        JObject errs = o["errors"] as JObject;
                        if (errs != null)
                        {
                            foreach (JProperty p in errs.Properties())
                            {
                                string prefix = p.Name == "" ? "" : p.Name + ": ";
                                JArray arr = p.Value as JArray;
                                if (arr != null)
                                {
                                    foreach (JToken m in arr) msgs.Add(prefix + m.ToString());
                                }
                                else
                                {
                                    msgs.Add(prefix + p.Value.ToString());
                                }
                            }
                        }
                        // Shopify: "userErrors": [ { "message": "..." } ]
                        JArray userErrors = o["userErrors"] as JArray;
                        if (userErrors != null)
                        {
                            foreach (JToken u in userErrors)
                            {
                                JToken m = u["message"];
                                if (m != null) msgs.Add(m.ToString());
                            }
                        }
                        if (msgs.Count > 0) return string.Join("; ", msgs.ToArray());
                        if (o["title"] != null) return o["title"].ToString();
                        if (o["message"] != null) return o["message"].ToString();
                    }
                }
                catch (Exception)
                {
                    // not JSON: fall through
                }
            }
            if (code.StartsWith("2")) return "OK";
            return body.Length > 300 ? body.Substring(0, 300) : body;
        }
    }
}
