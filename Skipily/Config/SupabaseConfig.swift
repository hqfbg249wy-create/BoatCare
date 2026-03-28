//
//  SupabaseConfig.swift
//  Skipily
//
//  Supabase Backend Configuration
//

import Foundation

enum SupabaseConfig {
    static let url = URL(string: "https://vcjwlyqkfkszumdrfvtm.supabase.co")!
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ"
    static let storageUrl = "\(url)/storage/v1"
}
